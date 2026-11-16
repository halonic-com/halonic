import type { SandboxStartCheck } from "@halonicjs/app";
import type { SandboxPasses } from "@halonicjs/studio-feature-inbox/api";

/**
 * A {@link SandboxStartCheck} that tells when a check passes (requirement
 * `studio.sandbox-start-check`), so the Inbox's sandbox row hears of a pass on a run page's
 * **Check again** and moves to Notices. Checks that refuse or can't run tell no one.
 *
 * @example
 * const { check, passes } = observedSandboxStartCheck(sandboxStartCheck(() => host.check()));
 */
export function observedSandboxStartCheck(inner: SandboxStartCheck): {
  readonly check: SandboxStartCheck;
  readonly passes: SandboxPasses;
} {
  const listeners = new Set<() => void>();
  return {
    check: {
      async check() {
        const result = await inner.check();
        if (result.ok) for (const listener of [...listeners]) listener();
        return result;
      },
    },
    passes: {
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
}
