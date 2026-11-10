import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxSession } from "@halonicjs/ports";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SrtSandbox } from "../src/srt-sandbox.ts";

/**
 * Attacks on the user's next `git status` through a submodule that is not
 * checked out: its `.git` can't be denied (git refuses the empty file the
 * fence would put there), so the session-end check has to undo what the
 * program plants. Run with `pnpm test:fence`, like `srt-attacks.test.ts`.
 */
const sandbox = new SrtSandbox();

describe("a program planting a repository in a submodule that is not checked out", () => {
  let base: string;
  let work: string;
  let marker: string;

  function git(...args: string[]): void {
    execFileSync("git", args, { cwd: work, stdio: "ignore" });
  }

  async function run(session: SandboxSession, script: string): Promise<void> {
    const started = await session.start({ program: "sh", args: ["-c", script] });
    await started.exited;
  }

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), "srt-git-attack-"));
    work = join(base, "work");
    marker = join(base, "pwned");
    await mkdir(join(work, "docs"), { recursive: true });
    git("init", "--quiet");
    // A gitlink in the index with no `docs/.git`: a plain clone, or after `git submodule deinit`.
    git("update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},docs`);
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  /** A git folder at `folder` whose settings run a command on `git status`. */
  const repository = (folder: string) =>
    `mkdir -p ${folder}/objects ${folder}/refs && echo 'ref: refs/heads/main' > ${folder}/HEAD && ` +
    `printf '[core]\\n\\tfsmonitor = touch ${marker}\\n' > ${folder}/config`;

  it.each([
    [
      "a .git file pointing at its own folder",
      `${repository("docs")} && printf 'gitdir: .\\n' > docs/.git`,
    ],
    ["a .git folder", repository("docs/.git")],
  ])("can't make the user's next git status run a command with %s", async (_, plant) => {
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
    await run(session, `cd ${work} && ${plant}`);
    // The attack is in place while the session runs: the check works at session end.
    expect(existsSync(join(work, "docs", ".git"))).toBe(true);
    await session.close();
    expect(existsSync(join(work, "docs", ".git"))).toBe(false);
    expect(blocks).toContain(join(work, "docs", ".git"));
    git("status", "--porcelain");
    expect(existsSync(marker)).toBe(false);
  });
});
