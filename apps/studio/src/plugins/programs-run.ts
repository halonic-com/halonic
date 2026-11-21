import { AgentHostSandbox, type AgentHostTransport } from "@halonicjs/adapter-agent-host-client";
import { type LocalToolState, localToolStateOf } from "@halonicjs/app";
import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/**
 * Whether this computer can run the plugins' programs, for the trust check's Programs rows
 * (`studio.desktop-plugin-programs-run`): the agent host's sandbox check, read each time the check
 * opens. On macOS and Linux it is the check `halonic run` makes for plugin programs. On Windows the
 * host checks its WSL setup, while `halonic run` checks the sandbox's own Windows install, so the
 * host's answer wouldn't be true there (Ravi, HAL-14865): nothing is given, and the rows keep the
 * line that holds either way until the agent host starts plugin programs itself.
 *
 * @example
 * const programs = desktopProgramsRun(transport, "linux");
 * await programs?.(); // "ready", or "sandbox-unavailable" where the sandbox can't start
 */
export function desktopProgramsRun(
  transport: AgentHostTransport,
  platform: KeyboardPlatform,
): (() => Promise<LocalToolState["kind"]>) | undefined {
  if (platform === "windows") return undefined;
  return async () => (await localToolStateOf(await AgentHostSandbox.connect(transport))).kind;
}
