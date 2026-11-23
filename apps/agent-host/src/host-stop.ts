/** What the host stops, each as the one call that stops it; `undefined` for a part this host doesn't have. */
export interface HostParts {
  readonly remote: { close(): Promise<void> };
  readonly runs: { cancelAll(): Promise<void> };
  readonly connectors: { closeAll(): Promise<void> };
  readonly plugins: { stop(): Promise<void> } | undefined;
  readonly sessions: { closeAll(): Promise<void> };
  readonly programCopies: { close(): Promise<void> } | undefined;
  readonly bridges: { closeAll(): Promise<void> };
  /** The harness folders: what the runs left, and the proposals' git, last. */
  readonly folders: { stop(): Promise<void> };
}

/**
 * Stops the host's parts in the order that leaves no program running in a
 * folder that is gone: the gateway, the runs, the connectors, the sessions,
 * then the program copies with their git, and the proposals' git last.
 */
export async function stopHost(parts: HostParts): Promise<void> {
  // Close the gateway first, so nothing remote reaches a run that is being stopped.
  await parts.remote.close();
  // Stop the runs, then their sandboxed programs, so none outlives the host;
  // their bridges then have no caller.
  await parts.runs.cancelAll();
  // A connector closes its own session; then any session left.
  await parts.connectors.closeAll();
  await parts.plugins?.stop();
  await parts.sessions.closeAll();
  // No connector runs in a copy any more, so the copies and their git can go.
  await parts.programCopies?.close();
  await parts.bridges.closeAll();
  // No program runs any more, so what the runs left can go.
  await parts.folders.stop();
}
