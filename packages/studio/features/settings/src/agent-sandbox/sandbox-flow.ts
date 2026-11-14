import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * How Ctrl K's "Set up the agent sandbox" reaches the host that runs it and says the result in a
 * toast, since a command has no window of its own to say it in (`settings.sandbox-flow`).
 */
export interface SandboxFlow {
  /** Asks the host to set the sandbox up. The host asks Windows; nothing starts without this call. */
  request(): void;
  /** Calls `listener` on each `request`. Returns the function that stops it. */
  onRequest(listener: () => void): () => void;
}

/** Makes a flow with no host listening yet. */
export function createSandboxFlow(): SandboxFlow {
  const listeners = new Set<() => void>();
  return {
    request() {
      for (const listener of listeners) listener();
    },
    onRequest(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The window's sandbox flow; the Settings feature provides it. */
export const SandboxFlowService: ServiceKey<SandboxFlow> =
  serviceKey<SandboxFlow>("settings.sandbox-flow");
