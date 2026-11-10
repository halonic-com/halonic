import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";

/**
 * The agent host, as the executable loads it from the unpacked payload. For
 * now it prints its version and, with `--sandbox-check`, whether the sandbox
 * works on this machine. The loopback server comes next (HAL-4476).
 *
 * @returns the exit code
 */
export async function run(args: readonly string[], version: string): Promise<number> {
  process.stdout.write(`halonic-agent-host ${version}\n`);
  if (args.includes("--sandbox-check")) {
    process.stdout.write(`${JSON.stringify(await new SrtSandbox().check())}\n`);
  }
  return 0;
}
