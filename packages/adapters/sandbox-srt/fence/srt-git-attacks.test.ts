import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxSession } from "@halonicjs/ports";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitlinkMode, index } from "../src/git-index.test-helper.ts";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Attacks on the user's next `git status` through a submodule: one that is
 * not checked out, whose `.git` can't be denied (git refuses the empty file
 * the fence would put there), and the git folder and index of one that is.
 * The session-end check has to undo what the program plants. Each attack is
 * also run without the fence, to show it works. The plants don't use `cp` or
 * git, so nothing the fence denies (a git folder's `config` and `hooks`) stops
 * them halfway. Run with `pnpm test:fence`, like `srt-attacks.test.ts`.
 */
const sandbox = new SrtSandbox();

/** Shell that plants an attack in the working folder; `marker` is the file its command creates. */
type Plant = (marker: string) => string;

/** An attack's name, its shell, and the path in the working folder it plants last. */
type Attack = [name: string, plant: Plant, planted: string];

function open(base: string, work: string): Promise<SandboxSession> {
  return sandbox.open({
    workingFolder: work,
    tempFolder: join(base, "temp"),
    settingsFolder: null,
    readOnlyPaths: [],
    deniedPaths: [],
    env: { HOME: join(base, "temp") },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 120_000,
  });
}

/** Runs `script` in the fence and returns what it printed, its errors too. */
async function run(session: SandboxSession, script: string): Promise<string> {
  const started = await session.start({ program: "sh", args: ["-c", `(${script}) 2>&1`] });
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of started.stdout) text += decoder.decode(chunk, { stream: true });
  await started.exited;
  return text + decoder.decode();
}

function git(cwd: string, ...args: string[]): void {
  const settings = ["-c", "user.name=acme", "-c", "user.email=acme@example.test"];
  execFileSync("git", [...settings, "-c", "protocol.file.allow=always", ...args], {
    cwd,
    stdio: "ignore",
  });
}

/** Shell that prints settings which run `touch marker` on `git status`. */
function settings(marker: string): string {
  return `printf '[core]\\n\\tfsmonitor = touch ${marker}\\n'`;
}

/** Shell that makes a git folder at `folder` whose settings run `touch marker` on `git status`. */
function repository(folder: string, marker: string): string {
  return (
    `mkdir -p ${folder}/objects ${folder}/refs && echo 'ref: refs/heads/main' > ${folder}/HEAD && ` +
    `${settings(marker)} > ${folder}/config`
  );
}

/**
 * Shell that writes `bytes` to `file`, with the Node that runs these tests, so
 * the bytes don't depend on how the shell reads `printf` escapes.
 */
function bytesTo(file: string, bytes: Uint8Array): string {
  const write =
    'require("node:fs").writeFileSync(process.argv[1], Buffer.from(process.argv[2], "base64"))';
  return `'${process.execPath}' -e '${write}' ${file} ${Buffer.from(bytes).toString("base64")}`;
}

/** A git index with one gitlink, `path`, and the checksum git checks. */
function gitlinkIndex(path: string): Uint8Array {
  const bytes = index([{ path, mode: gitlinkMode }]);
  const body = bytes.subarray(0, bytes.length - 20);
  bytes.set(createHash("sha1").update(body).digest(), body.length);
  return bytes;
}

/** The attack tests for `plants`, on the working folder `setUp` makes. */
function attacks(setUp: (work: string) => Promise<void>, plants: Attack[]): void {
  let base: string;
  let work: string;
  let marker: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-git-attack-"));
    work = join(base, "work");
    marker = join(base, "pwned");
    await mkdir(work);
    await setUp(work);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it.each(plants)("works without the session check: %s", (_, plant) => {
    execFileSync("sh", ["-c", `cd ${work} && ${plant(marker)}`], { stdio: "ignore" });
    git(work, "status", "--porcelain");
    expect(existsSync(marker)).toBe(true);
  });

  it.each(plants)(
    "can't make the user's next git status run a command: %s",
    async (_, plant, planted) => {
      const session = await open(base, work);
      const blocks: string[] = [];
      session.onBlocked((block) => blocks.push(block.kind === "file" ? block.path : block.kind));
      const output = await run(session, `cd ${work} && ${plant(marker)}`);
      // The fence let the whole plant through, so only the session check can undo it.
      expect(existsSync(join(work, planted)), output).toBe(true);
      await session.close();
      expect(blocks.length).toBeGreaterThan(0);
      git(work, "status", "--porcelain");
      expect(existsSync(marker)).toBe(false);
    },
  );
}

describe("a program planting a repository in a submodule that is not checked out", () => {
  attacks(
    async (work) => {
      await mkdir(join(work, "docs"));
      git(work, "init", "--quiet");
      // A gitlink in the index with no `docs/.git`: a plain clone, or after `git submodule deinit`.
      git(work, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},docs`);
    },
    [
      [
        "a .git file pointing at its own folder",
        (marker) => `${repository("docs", marker)} && printf 'gitdir: .\\n' > docs/.git`,
        "docs/.git",
      ],
      ["a .git folder", (marker) => repository("docs/.git", marker), "docs/.git"],
    ],
  );
});

describe("a program planting settings in a submodule that is checked out", () => {
  attacks(
    async (work) => {
      const library = join(work, "..", "library");
      await mkdir(library);
      git(library, "init", "--quiet");
      git(library, "commit", "--quiet", "--allow-empty", "-m", "library");
      git(work, "init", "--quiet");
      git(work, "submodule", "--quiet", "add", library, "docs");
    },
    [
      [
        "a commondir in its git folder",
        // A git folder with settings of its own, which the commondir points at.
        (marker) =>
          `${repository("evil", marker)} && echo ../../../evil > .git/modules/docs/commondir`,
        ".git/modules/docs/commondir",
      ],
      [
        "a nested repository in its index",
        // The index is written by hand: git in the fence would stop at the denied `config`.
        (marker) =>
          `${bytesTo(".git/modules/docs/index", gitlinkIndex("theme"))} && ` +
          repository("docs/theme/.git", marker),
        "docs/theme/.git",
      ],
    ],
  );
});

describe("a program planting a repository in a submodule nested in a checked-out one", () => {
  let base: string;
  let work: string;
  let marker: string;

  /** Git as a user runs it; `protocol.file.allow` lets a submodule come from a local folder. */
  function git(cwd: string, ...args: string[]): void {
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.invalid",
        "-c",
        "protocol.file.allow=always",
        ...args,
      ],
      { cwd, stdio: "ignore" },
    );
  }

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-git-attack-"));
    work = join(base, "work");
    marker = join(base, "pwned");
    for (const name of ["theme", "docs", "work"]) await mkdir(join(base, name));
    git(join(base, "theme"), "init", "--quiet");
    git(join(base, "theme"), "commit", "--quiet", "--allow-empty", "-m", "theme");
    git(join(base, "docs"), "init", "--quiet");
    git(join(base, "docs"), "submodule", "add", "--quiet", join(base, "theme"), "theme");
    git(join(base, "docs"), "commit", "--quiet", "-m", "docs");
    git(work, "init", "--quiet");
    // `docs` is checked out; its own submodule `theme` is not, so `docs/theme` has no `.git`.
    git(work, "submodule", "add", "--quiet", join(base, "docs"), "docs");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("can't make the user's next git status run a command", async () => {
    const session = await sandbox.open({
      workingFolder: work,
      tempFolder: join(base, "temp"),
      settingsFolder: null,
      readOnlyPaths: [],
      deniedPaths: [],
      env: { HOME: join(base, "temp") },
      network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
      timeLimitMs: 120_000,
    });
    const blocks: string[] = [];
    session.onBlocked((block) => blocks.push(block.kind === "file" ? block.path : block.kind));
    const folder = "docs/theme/.git";
    const plant =
      `mkdir -p ${folder}/objects ${folder}/refs && echo 'ref: refs/heads/main' > ${folder}/HEAD && ` +
      `printf '[core]\\n\\tfsmonitor = touch ${marker}\\n' > ${folder}/config`;
    const started = await session.start({ program: "sh", args: ["-c", `cd ${work} && ${plant}`] });
    await started.exited;
    expect(existsSync(join(work, "docs", "theme", ".git"))).toBe(true);
    await session.close();
    expect(existsSync(join(work, "docs", "theme", ".git"))).toBe(false);
    expect(blocks).toContain(join(work, "docs", "theme", ".git"));
    git(work, "status", "--porcelain");
    expect(existsSync(marker)).toBe(false);
  });
});
