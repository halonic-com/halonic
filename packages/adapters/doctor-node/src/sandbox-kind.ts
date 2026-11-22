/**
 * The kind of sandbox srt runs, as an id the CLI and Studio each word:
 * `bubblewrap` on Linux, `seatbelt` on macOS, and `windows` for srt's own
 * Windows mode.
 */
export type SandboxKind = "bubblewrap" | "seatbelt" | "windows";

/**
 * The sandbox srt runs on each system, by the name Node gives the system
 * (see `SrtSandbox`). Inside Halonic's WSL distro the system is Linux, so
 * an agent host there runs bubblewrap (HAL-16290).
 */
const sandboxKinds: Readonly<Record<string, SandboxKind>> = {
  linux: "bubblewrap",
  darwin: "seatbelt",
  win32: "windows",
};

/**
 * The kind of sandbox on the ready Sandbox line, for `halonic doctor` and
 * for the agent host's answer to Studio, so both name the same one.
 *
 * @param system - the system as Node names it, such as `process.platform`
 * @returns the kind, or `undefined` on a system srt doesn't run on
 * @example
 * sandboxKindOf("darwin"); // "seatbelt"
 */
export function sandboxKindOf(system: string): SandboxKind | undefined {
  return sandboxKinds[system];
}
