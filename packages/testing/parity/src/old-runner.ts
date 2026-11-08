/**
 * Runs inside a scratch clone of the old repo, never in this one: the recorder
 * starts it with the old repo's own `tsx`, so the old code runs exactly as it
 * did at the reference commit.
 *
 *   tsx old-runner.ts <old clone> <jobs.json> <out.json> <empty home>
 *
 * For each job (a composed fixture workspace) it records the old loader's
 * diagnostics, the schema issues per file with their key paths, and the output
 * and exit code of the old `validate` command. Its types are loose on purpose:
 * the old modules are loaded by path and have no types here.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { oldEnvironment } from "./old-repo.ts";
import type { OldDiagnostic, OldFile, OldIssue, OldResult } from "./recording.ts";

interface Job {
  readonly id: string;
  readonly dir: string;
  readonly files: readonly string[];
}

interface RawIssue {
  readonly path: readonly (string | number)[];
  readonly code: string;
  readonly message: string;
}

interface SafeParser {
  safeParse(value: unknown): { success: boolean; error?: { issues: RawIssue[] } };
}

interface OldStore {
  read(path: string): Promise<string | null>;
  layout(): Promise<string>;
}

type OldModule = Record<string, unknown>;

/** The schema each file kind is checked with, by its export name in the old schema package. */
const schemaNames: Readonly<Record<string, string>> = {
  workspace: "WorkspaceSettings",
  deployments: "Deployments",
  models: "Models",
  provider: "Provider",
  runtime: "Runtime",
  knowledge: "KnowledgeSource",
  collection: "Collection",
  connector: "Connector",
  skill: "SkillFrontMatter",
  hub: "Hub",
  agent: "Agent",
  workflow: "Workflow",
  workflowTest: "WorkflowTest",
  routine: "Routine",
};

const [oldRoot = "", jobsPath = "", outPath = "", home = ""] = process.argv.slice(2);

async function load(path: string): Promise<OldModule> {
  return (await import(pathToFileURL(join(oldRoot, path)).href)) as OldModule;
}

function member<T>(module: OldModule, name: string): T {
  const value = module[name];
  if (value === undefined) {
    throw new Error(`The old code has no export "${name}"; is the clone at the reference commit?`);
  }
  return value as T;
}

const schema = await load("packages/core/schema/src/index.ts");
const config = await load("packages/core/config/src/index.ts");
const platform = await load("packages/platform/node/src/index.ts");

/** The file the loader read last, and what the schema said about each file it read. */
let reading: string | null = null;
const reads = new Set<string>();
const checked = new Map<string, { schema: string; issues: RawIssue[] }>();

for (const [kind, name] of Object.entries(schemaNames)) {
  const parser = member<SafeParser>(schema, name);
  const original = parser.safeParse.bind(parser);
  parser.safeParse = (value) => {
    const result = original(value);
    if (reading !== null && value !== undefined && !checked.has(reading)) {
      checked.set(reading, { schema: kind, issues: result.error?.issues ?? [] });
    }
    return result;
  };
}

function flatPathOf(layout: string): (file: string) => string {
  if (layout === "grouped") {
    return member<(file: string) => string>(config, "fromGrouped");
  }
  if (layout === "legacy-grouped") {
    return member<(file: string) => string>(config, "fromLegacyGrouped");
  }
  return (file) => file;
}

/** The loader writes one diagnostic per schema issue: "<key path>: <message>", with the line. */
function withLines(
  flatPath: string,
  issues: readonly RawIssue[],
  diagnostics: readonly OldDiagnostic[],
): OldIssue[] {
  const used = new Set<OldDiagnostic>();
  return issues.map((issue) => {
    const message = `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`;
    const match = diagnostics.find(
      (d) => !used.has(d) && d.path === flatPath && d.message === message,
    );
    const out: OldIssue = { path: [...issue.path], code: issue.code, message: issue.message };
    if (match === undefined) {
      return out;
    }
    used.add(match);
    return {
      ...out,
      ...(match.line === undefined ? {} : { line: match.line }),
      ...(match.col === undefined ? {} : { col: match.col }),
    };
  });
}

function runValidate(dir: string): OldResult["validate"] {
  const result = spawnSync(
    join(oldRoot, "node_modules/.bin/tsx"),
    ["apps/cli/src/main.ts", "validate", dir],
    {
      cwd: oldRoot,
      encoding: "utf8",
      env: oldEnvironment(home),
    },
  );
  return { exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

async function record(job: Job): Promise<OldResult> {
  const FsDefinitionStore = member<new (root: string) => unknown>(platform, "FsDefinitionStore");
  const withLayout = member<(store: unknown) => OldStore>(config, "withLayout");
  const loadWorkspace = member<(store: unknown) => Promise<{ diagnostics: OldDiagnostic[] }>>(
    config,
    "loadWorkspace",
  );
  const store = withLayout(new FsDefinitionStore(job.dir));
  const traced = {
    ...store,
    read: (path: string) => {
      reading = path;
      reads.add(path);
      return store.read(path);
    },
  };
  reads.clear();
  checked.clear();
  const { diagnostics } = await loadWorkspace(traced);
  reading = null;
  const flatPath = flatPathOf(await store.layout());
  const files: OldFile[] = job.files.map((file) => {
    const flat = flatPath(file);
    const seen = checked.get(flat);
    return {
      file,
      flatPath: flat,
      read: reads.has(flat),
      schema: seen?.schema ?? null,
      issues: withLines(flat, seen?.issues ?? [], diagnostics),
    };
  });
  return { id: job.id, diagnostics, files, validate: runValidate(realpathSync(job.dir)) };
}

const jobs = JSON.parse(readFileSync(jobsPath, "utf8")) as Job[];
const results: OldResult[] = [];
for (const job of jobs) {
  results.push(await record(job));
}
writeFileSync(outPath, JSON.stringify(results));
