import type { SandboxFence } from "@halonicjs/ports";

/** Why a session without a fence by design (`off`) starts no local tool. */
const noFenceReason =
  "the session has no fence at all. A local tool runs only inside the sandbox, even when running without it is allowed.";

/**
 * Why the fence doesn't hold a local tool's program, or `undefined` when it
 * is `fenced`. Only a proven fence counts: a launcher session (`off`) has no
 * fence by design, so it is refused like a fence that failed its probes.
 * Its caller reports a `stopped` session as ended before it asks; the case
 * still refuses, so every state but `fenced` does.
 */
export function unfencedReason(fence: SandboxFence): string | undefined {
  switch (fence.state) {
    case "fenced":
      return undefined;
    case "not-fenced":
      return fence.reason;
    case "off":
      return noFenceReason;
    case "stopped":
      return "The session has ended.";
  }
}
