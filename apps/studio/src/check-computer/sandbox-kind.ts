import type { KeyboardPlatform } from "@halonicjs/studio-shell";

/** The sandbox the agent host runs on each system, as `halonic doctor` names it (srt's). */
const sandboxKinds: Readonly<Record<KeyboardPlatform, string | undefined>> = {
  macos: "Seatbelt",
  linux: "bubblewrap",
  // The host runs on Windows itself or in Halonic's WSL distro, which the page can't tell apart.
  windows: undefined,
};

/**
 * The kind of sandbox a ready Sandbox line names on `platform`, or `undefined` where Studio
 * can't tell which the agent host runs, so the line says only "Ready".
 *
 * @example
 * sandboxKindOf("macos"); // "Seatbelt"
 */
export function sandboxKindOf(platform: KeyboardPlatform): string | undefined {
  return sandboxKinds[platform];
}
