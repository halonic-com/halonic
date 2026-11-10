import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findGit } from "./find-git.ts";
import { GitRunner } from "./git-runner.ts";
import { runProcess } from "./node/run-process.ts";

/** The author of every commit in the tests; invented. */
export const testAuthor = { name: "Acme Tester", email: "tester@acme.example" };

/** Temporary folders made by one test file. */
export class Scratch {
  readonly #folders: string[] = [];

  /** A new empty folder under the system's temporary folder. */
  async folder(): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), "halonic-adapter-git-"));
    this.#folders.push(folder);
    return folder;
  }

  /** Removes every folder it made; tests call it in `afterAll`. */
  async remove(): Promise<void> {
    await Promise.all(
      this.#folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
    );
  }
}

/** Writes `files` under `root` as they are, creating folders as needed. */
export async function writeFiles(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content, "utf8");
  }
}

/**
 * Runs git with none of the adapter's hardening, to set a test up. It goes
 * through `runProcess` too, so the package has one file that starts a
 * process (HAL-188's `process-starts` check).
 *
 * @throws Error when git fails, with its error output
 */
export async function plainGit(cwd: string, args: readonly string[]): Promise<string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.toUpperCase().startsWith("GIT_")) environment[name] = value;
  }
  const identity = [`user.name=${testAuthor.name}`, `user.email=${testAuthor.email}`];
  const config = [...identity, "init.defaultBranch=main", "protocol.file.allow=always"];
  const fullArgs = [...config.flatMap((entry) => ["-c", entry]), ...args];
  const result = await runProcess({
    program: await findGit(),
    args: fullArgs,
    cwd,
    env: { ...environment, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
    timeoutMs: 60_000,
    maxOutputBytes: 64 * 1024 * 1024,
  });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${result.code}): ${result.stderr}`);
  }
  return result.stdout.toString("utf8");
}

/** Makes `folder` a repository on `main` with `files` in one commit, with plain git. */
export async function initRepository(
  folder: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFiles(folder, files);
  await plainGit(folder, ["init", "--quiet", "--template="]);
  await plainGit(folder, ["add", "--all"]);
  await plainGit(folder, ["commit", "--quiet", "--message=Initial commit"]);
}

/** A new repository in the scratch folder, with `files` in one commit. */
export async function repositoryWith(
  scratch: Scratch,
  files: Readonly<Record<string, string>> = { "a.yaml": "1\n" },
): Promise<string> {
  const folder = await scratch.folder();
  await initRepository(folder, files);
  return folder;
}

/** The adapter's runner for the tests, with its hooks folder in the scratch folder. */
export async function testRunner(
  scratch: Scratch,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<GitRunner> {
  return GitRunner.create({ environment, hooksFolder: await scratch.folder() });
}
