import type {
  HostPaths,
  OwnSandboxCheck,
  SettingsFolderWriter,
} from "@halonicjs/adapter-harness-kit/web";
import type { Harness, ProgramProbe } from "@halonicjs/ports";
import { detectCodex } from "./detect.ts";
import { codexEnvironment } from "./environment.ts";
import { CodexRun } from "./run.ts";
import { codexSignIn } from "./sign-in-command.ts";

/**
 * What the Codex harness is made with where there is no Node, such as the
 * Cloudflare Worker. Every part is given: nothing falls back to this
 * computer's disk or path rules.
 */
export interface CodexWebHarnessOptions {
  /** Finds `codex` where it runs and asks it for its version and sign-in. */
  probe: ProgramProbe;
  /** Writes the agent's `config.toml` where Codex runs. */
  settings: SettingsFolderWriter;
  /** Halonic's version, which Codex puts in the user agent of its requests to the bridge. */
  halonicVersion: string;
  /** Whether Codex's own sandbox works where it runs. */
  ownSandbox: OwnSandboxCheck;
  /** The path rules of the machine Codex runs on. */
  paths: HostPaths;
}

/**
 * Codex as a {@link Harness}, with every part given. The desktop's
 * `codexHarness` builds this on this computer's disk and `node:path`.
 *
 * @example
 * const codex = codexWebHarness({ probe, settings, halonicVersion, ownSandbox, paths: posixPath });
 */
export function codexWebHarness(options: CodexWebHarnessOptions): Harness {
  const { probe, settings, ownSandbox, paths } = options;
  const clientInfo = { name: "halonic", title: "Halonic", version: options.halonicVersion };
  return {
    id: "codex",
    name: "Codex",
    detect: (detectOptions) => detectCodex(probe, detectOptions),
    environment: codexEnvironment,
    start: (task, session, bridge) =>
      new CodexRun(task, session, bridge, { settings, clientInfo, ownSandbox, paths }),
    signIn: codexSignIn,
  };
}
