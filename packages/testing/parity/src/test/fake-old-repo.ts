import { execFileSync } from "node:child_process";
import { chmodSync, realpathSync } from "node:fs";
import { basename } from "node:path";
import { oldTsx } from "../old-repo.ts";
import type { TestFolders } from "../test-folders.ts";

/** Every schema the old runner looks up, by its export name. */
const schemaNames = [
  "WorkspaceSettings",
  "Deployments",
  "Models",
  "Provider",
  "Runtime",
  "KnowledgeSource",
  "Collection",
  "Connector",
  "SkillFrontMatter",
  "Hub",
  "Agent",
  "Workflow",
  "WorkflowTest",
  "Routine",
];

/**
 * A stand-in for the old schema: a value fails on every key set to "BAD"
 * (the key "root" fails the whole value) and gets a silent issue for "QUIET".
 */
function schemaModule(omit: readonly string[]): string {
  const exports = schemaNames
    .filter((name) => !omit.includes(name))
    .map((name) => `export const ${name} = parser();`);
  return `function parser() {
  return {
    safeParse(value) {
      const issues = [];
      for (const [key, text] of Object.entries(value ?? {})) {
        if (text === "BAD") {
          issues.push({ path: key === "root" ? [] : [key], code: "invalid_type", message: "Expected a number" });
        }
        if (text === "QUIET") {
          issues.push({ path: [key], code: "custom", message: "Not reported" });
        }
      }
      return issues.length === 0 ? { success: true } : { success: false, error: { issues } };
    },
  };
}
${exports.join("\n")}
`;
}

/**
 * A stand-in for the old loader. It reads three flat files, reports a missing
 * one as a warning, "::: " as bad YAML, and one error per loud schema issue
 * with the line of its key. Like the old loader, it may check a file twice.
 */
const configModule = `import * as schema from "../../schema/src/index.ts";

const kinds = { "workspace.yaml": "WorkspaceSettings", "agent.yaml": "Agent", "models.yaml": "Models" };
const prefixes = { grouped: "grouped/", "legacy-grouped": "legacy/", flat: "" };

export const fromGrouped = (file) => file.replace(/^grouped\\//, "");
export const fromLegacyGrouped = (file) => file.replace(/^legacy\\//, "");

export function withLayout(store) {
  return {
    read: async (path) => store.read(prefixes[store.layoutName()] + path),
    layout: async () => store.layoutName(),
  };
}

export async function loadWorkspace(store) {
  const diagnostics = [];
  for (const [path, name] of Object.entries(kinds)) {
    const text = await store.read(path);
    if (text === null) {
      diagnostics.push({ severity: "warning", path, message: "file is missing" });
      continue;
    }
    if (text.includes(":::")) {
      diagnostics.push({ severity: "error", path, message: "bad YAML", line: 1, col: 1 });
      continue;
    }
    const lines = text.split("\\n").filter((line) => line !== "");
    const value = Object.fromEntries(lines.map((line) => line.split(": ")));
    const result = schema[name].safeParse(value);
    schema[name].safeParse({});
    for (const issue of result.error?.issues ?? []) {
      if (issue.code === "custom") {
        continue;
      }
      const key = issue.path.join(".");
      const index = key === "" ? -1 : lines.findIndex((line) => line.startsWith(key + ":"));
      diagnostics.push({
        severity: "error",
        path,
        message: key === "" ? issue.message : key + ": " + issue.message,
        ...(index < 0 ? {} : { line: index + 1, col: 3 }),
      });
    }
  }
  // tests.yaml names the test cases of one workflow, a line each; without it there's no workspace.
  const tests = await store.read("tests.yaml");
  if (tests === null) {
    return { diagnostics };
  }
  const cases = tests.split("\\n").filter((line) => line !== "").map((name) => ({ name }));
  return { workspace: { hubs: { acme: { tests: { greet: { value: { cases } } } } } }, diagnostics };
}
`;

/** Deterministic ids, as the old util makes them. */
const utilModule = `export function fixedIds() {
  const counters = new Map();
  return {
    next(prefix) {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return prefix + "_" + n;
    },
  };
}
`;

/** A run store that lists the newest run first, so the runner has to put them in order. */
const memoryModule = `export class MemoryRunStore {
  runs = new Map();
  async append(event) {
    const events = this.runs.get(event.runId) ?? [];
    events.push(event);
    this.runs.set(event.runId, events);
  }
  async list() {
    return [...this.runs.keys()].reverse().map((id) => ({ id }));
  }
  async get(id) {
    return { id, events: this.runs.get(id)?.length ?? 0 };
  }
  async events(id) {
    return this.runs.get(id) ?? [];
  }
}
`;

/**
 * A stand-in for the old test runner. Each case starts a run at the clock's
 * time and notes what Date.now says; "nested" starts a second run, "random"
 * logs a random number, and "broken" fails.
 */
const testRunnerModule = `export async function runCase(workspace, hub, workflow, testCase, deps) {
  const start = async (kind) => {
    const runId = deps.ids.next("test");
    const at = deps.clock.now().toISOString();
    await deps.runStore.append({ type: "run.started", kind, runId, at, wall: Date.now() });
    return runId;
  };
  const runId = await start(workflow);
  if (testCase.name === "nested") {
    await start("child");
  }
  if (testCase.name === "random") {
    await deps.runStore.append({ type: "note", runId, value: Math.random() });
  }
  const broken = testCase.name === "broken";
  return { name: testCase.name, passed: !broken, failures: broken ? ["expected status completed"] : [], runId };
}
`;

const platformModule = `import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class FsDefinitionStore {
  constructor(root) {
    this.root = root;
  }
  async read(path) {
    const file = join(this.root, path);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }
  layoutName() {
    if (existsSync(join(this.root, "grouped"))) {
      return "grouped";
    }
    return existsSync(join(this.root, "legacy")) ? "legacy-grouped" : "flat";
  }
}
`;

/**
 * A stand-in for the old CLI, for the calls the runner makes with a preload.
 * `run <dir>` stores a run with an ID made the old way (time and random
 * bytes), and a nested one with "nested"; "flaky" prints a time no preload
 * fixes; anything else fails with a usage line.
 */
const cliModule = `import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [command, dir, flag] = process.argv.slice(2);
const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return "run_" + Date.now().toString(36) + "_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const store = (runId, extra) => {
  mkdirSync(join(dir, ".studio", "runs"), { recursive: true });
  const event = { type: "run.started", runId, at: new Date().toISOString(), dir, ...extra };
  appendFileSync(join(dir, ".studio", "runs", runId + ".jsonl"), JSON.stringify(event) + "\\n");
};
if (command === "run") {
  const runId = newId();
  store(runId, {});
  if (flag === "nested") {
    store(newId(), { parent: runId });
  }
  console.log("Run " + runId + ": completed  (saved in " + dir + "/.studio/runs" + ")");
  process.exit(0);
}
if (command === "flaky") {
  console.log(String(performance.now()));
  process.exit(0);
}
console.error("usage: studio run <dir>");
process.exit(1);
`;

/**
 * The old tsx: the old validate prints the folder and fails; a call with a
 * preload runs the stand-in CLI in Node; anything else runs in Node.
 */
const tsxScript = `#!/bin/sh
if [ "$1" = "--import" ]; then
  exec node "$@"
fi
if [ "$1" = "apps/cli/src/main.ts" ]; then
  echo "checked $3"
  echo "1 problem" >&2
  exit 1
fi
exec node "$@"
`;

/** The same stand-in as a batch file, which is what pnpm installs as `tsx.cmd` on Windows. */
const tsxBatch = [
  "@echo off",
  'if "%~1"=="--import" goto run',
  'if not "%~1"=="apps/cli/src/main.ts" goto run',
  "echo checked %~3",
  ">&2 echo 1 problem",
  "exit /b 1",
  ":run",
  "node %*",
  "",
].join("\r\n");

export interface FakeOldRepo {
  readonly clone: string;
  /** The commit the clone is at; the recorder must be told to expect it. */
  readonly head: string;
}

/**
 * A committed git clone with the old repo's shape: a schema, a loader, a file
 * store and an installed tsx, small enough to read in one go.
 *
 * @param omit - schema exports to leave out, to make the runner fail
 */
export function fakeOldRepo(folders: TestFolders, omit: readonly string[] = []): FakeOldRepo {
  const clone = realpathSync(folders.make());
  folders.write(clone, {
    ".gitignore": "node_modules\n",
    "packages/core/schema/src/index.ts": schemaModule(omit),
    "packages/core/config/src/index.ts": configModule,
    "packages/platform/node/src/index.ts": platformModule,
    "packages/core/util/src/index.ts": utilModule,
    "packages/store/memory/src/index.ts": memoryModule,
    "packages/testing/test-runner/src/index.ts": testRunnerModule,
    "apps/cli/src/main.ts": cliModule,
    [`node_modules/.bin/${basename(oldTsx(clone))}`]:
      process.platform === "win32" ? tsxBatch : tsxScript,
  });
  chmodSync(oldTsx(clone), 0o755);
  const git = (...args: string[]): string =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "-c",
        "commit.gpgsign=false",
        "-C",
        clone,
        ...args,
      ],
      { encoding: "utf8", stdio: "pipe" },
    ).trim();
  git("init", "-q");
  git("add", ".");
  git("commit", "-q", "-m", "old");
  return { clone, head: git("rev-parse", "HEAD") };
}
