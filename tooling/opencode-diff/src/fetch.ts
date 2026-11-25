import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { readEnvNames } from "./env-names.ts";
import type { VersionFacts } from "./report.ts";
import { readSchemaKeys } from "./schema-keys.ts";

/** The package with OpenCode's Linux program: the one CI and the runner image pin. */
export const programPackage = "@opencode/cli-linux-x64";

/** The package with OpenCode's config schema, released with the same version. */
export const schemaPackage = "@opencode/schema";

/** Runs a program in a folder and gives what it printed. */
export type RunProgram = (program: string, args: string[], folder: string) => Promise<string>;

/** Runs a program without a shell, so no argument is read as shell text. */
export const runProgram: RunProgram = async (program, args, folder) => {
  const { stdout } = await promisify(execFile)(program, args, {
    cwd: folder,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
};

/**
 * Downloads one OpenCode version's program and schema packages into
 * `folder` with `npm pack`, unpacks them with `tar` and reads them. No
 * package script runs: `npm pack` only downloads.
 *
 * @throws Error when a download or unpacking fails, or the schema package's layout changed
 */
export async function fetchVersion(
  version: string,
  folder: string,
  run: RunProgram = runProgram,
): Promise<VersionFacts> {
  const program = await unpack(`${programPackage}@${version}`, join(folder, "program"), run);
  const schema = await unpack(`${schemaPackage}@${version}`, join(folder, "schema"), run);
  const binary = await readFile(join(program.folder, "package", "bin", "opencode"));
  return {
    version,
    integrity: program.integrity,
    envNames: readEnvNames(binary),
    schemaKeys: readSchemaKeys(await readModules(join(schema.folder, "package", "dist"))),
  };
}

/** Downloads `spec` into `folder`, unpacks it there and gives the tarball's integrity. */
async function unpack(
  spec: string,
  folder: string,
  run: RunProgram,
): Promise<{ folder: string; integrity: string }> {
  await mkdir(folder, { recursive: true });
  const tarball = (await run("npm", ["pack", spec, "--silent"], folder)).trim().split("\n").at(-1);
  if (tarball === undefined || tarball === "") throw new Error(`npm pack ${spec} named no file.`);
  await run("tar", ["-xzf", tarball], folder);
  const digest = createHash("sha512")
    .update(await readFile(join(folder, tarball)))
    .digest("base64");
  return { folder, integrity: `sha512-${digest}` };
}

/** Every `.js` file under `folder`, by its path relative to it with `/`. */
async function readModules(folder: string): Promise<Map<string, string>> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const modules = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const path = join(entry.parentPath, entry.name);
    modules.set(relative(folder, path).split("\\").join("/"), await readFile(path, "utf8"));
  }
  return modules;
}
