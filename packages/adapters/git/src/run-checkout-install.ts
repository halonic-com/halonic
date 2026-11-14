import { delimiter } from "node:path";
import { findProgram, isAbsolutePath } from "@halonicjs/adapter-system-node";
import { type ProcessCall, type ProcessResult, runProcess } from "./node/run-process.ts";
import { checkRunCheckoutFiles } from "./run-checkout-files.ts";

// The run's one step outside the sandbox: the dependencies, installed from
// the lockfile before the sandbox starts, so the program inside needs no
// network and never meets a registry.

/** How {@link installRunCheckout} runs pnpm. Every field has a default. */
export interface RunCheckoutInstallOptions {
  /** The pnpm program's absolute path; the one on the `PATH` by default. */
  pnpm?: string;
  /** The folder pnpm puts its temporary files in, such as `RunCheckoutFence.tempFolder`; the system's by default. */
  tempFolder?: string;
  /** What pnpm starts from, before it is cut down; `process.env` by default. */
  environment?: Readonly<Record<string, string | undefined>>;
  /** The registry every package comes from, whatever the checkout's own settings say; the npm registry by default. */
  registry?: string;
  /** Limit on the install; 10 minutes by default. */
  timeoutMs?: number;
  /** Starts the program; the real one by default. Tests give their own, so no program starts. */
  run?: (call: ProcessCall) => Promise<ProcessResult>;
}

/**
 * What pnpm gets from the host's environment, and nothing else: where
 * programs and the home folder are, so it finds `node` and its own package
 * store, and the proxy and certificate settings a network needs. A `npm_config_*`
 * or `PNPM_*` variable could point it at another registry or switch the
 * lifecycle scripts back on, so none passes.
 */
const inheritedNames = new Set([
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "SSL_CERT_FILE",
  "NODE_EXTRA_CA_CERTS",
]);

const defaultRegistry = "https://registry.npmjs.org/";

/**
 * The arguments of the install, each a rule of the run's start. The
 * checkout holds files that earlier runs committed, and pnpm reads several
 * of them, so each way they could start a program or redirect the install
 * is shut here, on the host's side.
 */
function installArguments(registry: string): string[] {
  return [
    "install",
    // Exactly what the lockfile says, or the install fails; it never edits it.
    "--frozen-lockfile",
    // Packages already in the host's store aren't fetched again.
    "--prefer-offline",
    // A package's install script would run here, outside the sandbox.
    "--ignore-scripts",
    // The checkout's `.pnpmfile.cjs` is code, and its hooks would run here.
    "--ignore-pnpmfile",
    // The checkout's `packageManager` field must not pick, download or run another pnpm.
    "--config.manage-package-manager-versions=false",
    "--pm-on-fail=ignore",
    // The checkout's `.npmrc` and `pnpm-workspace.yaml` can name a registry; the host's choice wins.
    `--registry=${registry}`,
  ];
}

/**
 * Runs `pnpm install --frozen-lockfile` in a run's checkout, with no shell
 * and no lifecycle scripts. It is the only step of a run that runs outside
 * the sandbox and reaches the network, so it is limited to what the
 * lockfile names and starts no program of a package.
 *
 * @throws Error when `folder` isn't absolute, its settings files or lockfile reach outside it, pnpm isn't found, or the install fails or takes too long; the message holds the end of pnpm's own output
 */
export async function installRunCheckout(
  folder: string,
  options: RunCheckoutInstallOptions = {},
): Promise<void> {
  if (!isAbsolutePath(folder)) throw new Error(`A run folder is absolute, not ${folder}.`);
  await checkRunCheckoutFiles(folder);
  const environment = options.environment ?? process.env;
  const pnpm = options.pnpm ?? (await findPnpm(environment));
  if (!isAbsolutePath(pnpm)) throw new Error(`The pnpm program must be an absolute path: ${pnpm}`);
  const run = options.run ?? runProcess;
  const result = await run({
    program: pnpm,
    args: installArguments(options.registry ?? defaultRegistry),
    cwd: folder,
    env: installEnvironment(environment, options.tempFolder),
    timeoutMs: options.timeoutMs ?? 600_000,
    maxOutputBytes: 16 * 1024 * 1024,
  });
  if (result.code !== 0) {
    throw new Error(
      `The install in ${folder} failed with code ${result.code}: ${tail(`${result.stdout.toString("utf8")}\n${result.stderr}`)}`,
    );
  }
}

async function findPnpm(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<string> {
  const path = environment["PATH"] ?? environment["Path"] ?? "";
  const pnpm = await findProgram("pnpm", { path });
  if (pnpm !== undefined) return pnpm;
  throw new Error(
    "pnpm was not found in any absolute folder of the PATH. Install pnpm and try again.",
  );
}

/** The inherited names, with the `PATH` cut to its absolute folders, and the temp folder. */
function installEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  tempFolder: string | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined || !inheritedNames.has(name.toUpperCase())) continue;
    result[name] = name.toUpperCase() === "PATH" ? absoluteFolders(value) : value;
  }
  if (tempFolder !== undefined)
    Object.assign(result, { TMPDIR: tempFolder, TEMP: tempFolder, TMP: tempFolder });
  // Not a place to ask questions or to look for a newer pnpm.
  return {
    ...result,
    CI: "true",
    // Corepack's pnpm program reads `packageManager` too; it must run the pnpm it holds.
    COREPACK_ENABLE_PROJECT_SPEC: "0",
    COREPACK_ENABLE_AUTO_PIN: "0",
    npm_config_update_notifier: "false",
  };
}

function absoluteFolders(path: string): string {
  return path
    .split(delimiter)
    .filter((folder) => isAbsolutePath(folder))
    .join(delimiter);
}

/** The last lines of pnpm's output, which say why it stopped; pnpm writes its errors to stdout, so both are read. */
function tail(output: string): string {
  return output.trim().split("\n").slice(-10).join("\n");
}
