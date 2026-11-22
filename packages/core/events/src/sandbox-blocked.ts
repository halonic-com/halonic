import { shortenHome } from "./home-path.ts";

/**
 * An access a step's sandbox refused, as the `Sandbox` port reports it: a
 * file read or write, or a connection to a site. A copy of the port's
 * `SandboxBlock`, so this package doesn't depend on the ports.
 */
export type SandboxBlock =
  | { kind: "file"; path: string; access: "read" | "write" }
  | { kind: "network"; host: string; port: number | null };

/**
 * What a `sandbox.blocked` event names: one blocked target, or `others`, the
 * blocked accesses to the targets past the ones a step's log names.
 */
export type LoggedSandboxBlock = SandboxBlock | { kind: "others" };

/**
 * A step's sandbox refused an access (requirement `events.sandbox-blocked`).
 * `count` is the running total of refused accesses to this target (or to
 * `others`) in the step so far: the engine logs a target's first block at
 * once and the total at the end of the step. A later event replaces an
 * earlier count, it doesn't add to it: events with 1 and then 7 for one
 * target mean 7 refused accesses.
 */
export interface SandboxBlockedEvent {
  type: "sandbox.blocked";
  state: string;
  agent: string;
  block: LoggedSandboxBlock;
  count: number;
}

/**
 * The most distinct targets one step's run log names in `sandbox.blocked`
 * events. Blocks of further targets are counted in one `others` event, so a
 * program that tries many files can't flood the log.
 */
export const maxBlockedTargetsPerStep = 100;

/**
 * Makes the copy of a blocked access that a `sandbox.blocked` event carries
 * (requirement `events.sandbox-blocked`): a file path in the person's home
 * folder starts with `~`, the way `sandbox.opened` writes paths. A site is
 * copied as it is.
 *
 * @param block - the access the sandbox refused
 * @param home - the person's home folder, or `null` when it is unknown
 * @returns the block for the event
 *
 * @example
 * sandboxBlockedView({ kind: "file", path: "<home>/.ssh/id_ed25519", access: "read" }, "<home>");
 * // => { kind: "file", path: "~/.ssh/id_ed25519", access: "read" }
 */
export function sandboxBlockedView(block: SandboxBlock, home: string | null): SandboxBlock {
  if (block.kind === "network") return { kind: "network", host: block.host, port: block.port };
  return { kind: "file", path: shortenHome(block.path, home), access: block.access };
}
