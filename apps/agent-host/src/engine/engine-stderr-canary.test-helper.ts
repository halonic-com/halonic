// The engine role as `halonic-agent-host --engine` runs it, with one change:
// once the shell names the sandbox host, it reads the secrets `acme_api_key`
// (shaped like a key) and `acme_refresh_token` (no known shape) through the
// control pipe and prints their values on standard error after their step
// ended, as a careless library or step would. The shell's supervisor test
// (`engine-supervisor/tests/engine_stderr.rs`, HAL-18245) starts it and
// checks that the value never reaches `shell.log`.
//
// Run as `node engine-stderr-canary.test-helper.ts --engine --profile-folder
// <p> --workspace <w>`. Everything else is the real engine: its parts, its
// control pipe, its broker reads and its standard streams.
import { takeStandardOutput } from "../stdio/standard-output.ts";
import { BrokerSecrets } from "./broker-secrets.ts";
import type { ControlPipe } from "./control-pipe.ts";
import { engineCommand } from "./engine-command.ts";
import type { RunningEngine } from "./engine-role.ts";
import { type EngineCommandParts, engineRoleParts } from "./open-engine.ts";
import { redactStandardError, type SecretRedactor } from "./secret-redactor.ts";

/** The secrets the canary reads, as the test stores them in the broker. */
const canaryNames = ["acme_api_key", "acme_refresh_token"];

/** The line printed after the canary's lines, so the test knows they have all been printed. */
const printedMarker = "acme canary: printed";

/** The real engine role's parts, whose engine leaks the canary once the shell names the sandbox host. */
function canaryParts(...args: Parameters<typeof engineRoleParts>): EngineCommandParts {
  const parts = engineRoleParts(...args);
  const [, , writeError, redactor] = args;
  return {
    ...parts,
    open: async (pipe) => leakingOnSandboxHost(await parts.open(pipe), pipe, writeError, redactor),
  };
}

/**
 * `engine`, which reads and prints the canary the first time the shell
 * names the sandbox host. Not sooner: the shell faults a broker request
 * that comes before the handshake.
 */
function leakingOnSandboxHost(
  engine: RunningEngine,
  pipe: ControlPipe,
  writeError: (text: string) => void,
  redactor: SecretRedactor,
): RunningEngine {
  let leaked = false;
  // `runningEngine` gives a plain object, so the spread keeps every method.
  return {
    ...engine,
    useSandboxHost: (connection) => {
      engine.useSandboxHost(connection);
      if (leaked) return;
      leaked = true;
      void leakCanaries(pipe, writeError, redactor);
    },
  };
}

/**
 * Prints each canary's value the ways an engine can reach standard error.
 * `BrokerSecrets` ends a read's step as it returns, so every print comes
 * after the step ended, through the engine's own redactor.
 */
async function leakCanaries(
  pipe: ControlPipe,
  writeError: (text: string) => void,
  redactor: SecretRedactor,
): Promise<void> {
  const secrets = new BrokerSecrets((kind, name) => pipe.ask(kind, name), redactor);
  for (const name of canaryNames) {
    try {
      const value = await secrets.get(name);
      // Standard output is the pipe's; a stray print there goes to standard error.
      console.log(`acme step: calling the API with ${value}`);
      console.error(`acme step: 401 Unauthorized for key ${value}`);
      writeError(`The engine hit an error (harness-host): bad key ${value}\n`);
    } catch (error) {
      writeError(
        `acme canary: the read failed: ${error instanceof Error ? error.message : error}\n`,
      );
    }
  }
  writeError(`${printedMarker}\n`);
}

process.exitCode =
  (await engineCommand(
    process.argv.slice(2),
    "0.0.0-test",
    {
      input: process.stdin,
      writeError: (text) => process.stderr.write(text),
      redactStandardError: (redactor) => redactStandardError(redactor),
      takeOutput: () => takeStandardOutput(),
    },
    canaryParts,
  )) ?? 2;
