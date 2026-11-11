import {
  diskSettingsFolder,
  type OwnSandboxCheck,
  ownSandboxCheck,
  type SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit";
import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { detectCodex } from "./detect.ts";
import { codexEnvironment } from "./environment.ts";
import { CodexRun } from "./run.ts";
import { codexSignIn } from "./sign-in-command.ts";

/** What the Codex harness is made with. */
export interface CodexHarnessOptions {
  /** Finds `codex` on this computer and asks it for its version and sign-in. */
  probe: ProgramProbe;
  /** Writes the agent's `config.toml`; this computer's disk when absent. */
  settings?: SettingsFolderWriter;
  /** Halonic's version, which Codex puts in the user agent of its requests to the bridge. */
  halonicVersion?: string;
  /** Whether Codex's own sandbox works here; checked on this computer with `probe` when absent. */
  ownSandbox?: OwnSandboxCheck;
}

/**
 * Codex as a {@link Harness}: an agent whose file says `harness: codex`
 * runs in `codex app-server`, inside Halonic's sandbox and behind the run's
 * bridge.
 *
 * @example
 * const codex = codexHarness({ probe });
 * const run = codex.start(task, session, bridge);
 * for await (const event of run) record(event);
 */
export function codexHarness(options: CodexHarnessOptions): Harness {
  const settings = options.settings ?? diskSettingsFolder;
  const ownSandbox = options.ownSandbox ?? ownSandboxCheck({ probe: options.probe });
  const clientInfo = {
    name: "halonic",
    title: "Halonic",
    version: options.halonicVersion ?? "0.0.0",
  };
  return {
    id: "codex",
    name: "Codex",
    detect: () => detectCodex(options.probe),
    environment: codexEnvironment,
    start: (task, session, bridge) =>
      new CodexRun(task, session, bridge, { settings, clientInfo, ownSandbox }),
    signIn: codexSignIn,
  };
}
