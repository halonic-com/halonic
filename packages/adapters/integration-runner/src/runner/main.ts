// The runner process: `node --permission … <runner file> <nonce> <entry file>
// <export>`. It speaks the protocol on its stdin and stdout, so nothing else
// may write to stdout: the console goes to stderr, which Halonic reads as
// the runner's log. It loads the integration only after `start` has arrived.

import { Console } from "node:console";
import process from "node:process";
import { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import type { Integration, TokenStore } from "@halonicjs/ports";
import { readRunnerArgs } from "../runner-args.ts";
import { serveRunner } from "./serve-runner.ts";

/** The streams the runner speaks on. */
export interface RunnerStdio {
  input: ReadableStream<Uint8Array>;
  output: WritableStream<Uint8Array>;
}

/** Loads a module by its file URL. */
export type ImportModule = (url: string) => Promise<Record<string, unknown>>;

/**
 * Serves the integration named by the runner's arguments until Halonic closes
 * its stdin.
 *
 * @throws {Error} when the arguments are wrong, or the module doesn't export an integration under that name
 * @throws {RunnerProtocolError} when Halonic's frames break the protocol
 */
export async function runRunner(
  argList: readonly string[],
  stdio: RunnerStdio,
  importModule: ImportModule = (url) => import(url),
): Promise<void> {
  const args = readRunnerArgs(argList);
  await serveRunner({
    ...stdio,
    nonce: args.nonce,
    connect: async (host) => {
      const module = await importModule(pathToFileURL(args.entryFile).href);
      return integrationIn(module, args.exportName).connect({ ...host, tokens: noTokens });
    },
  });
}

/**
 * No token value crosses the bridge, and the loader refuses a sheet that
 * declares tokens (design HAL-958, section 3.5). So an integration that asks
 * for one anyway gets an error, never a value.
 */
const noTokensMessage = "Integrations you build or change can't keep sign-in tokens yet.";
const noTokens: TokenStore = {
  get: () => Promise.reject(new Error(noTokensMessage)),
  set: () => Promise.reject(new Error(noTokensMessage)),
  remove: () => Promise.reject(new Error(noTokensMessage)),
};

function integrationIn(module: Record<string, unknown>, exportName: string): Integration {
  const value = module[exportName];
  if (typeof value !== "object" || value === null || !("connect" in value)) {
    throw new Error(`the integration's module exports no integration named "${exportName}"`);
  }
  return value as Integration;
}

if (import.meta.main) {
  const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
  globalThis.console = new Console(process.stderr, process.stderr);
  runRunner(process.argv.slice(2), {
    input: Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
    output,
  }).then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
