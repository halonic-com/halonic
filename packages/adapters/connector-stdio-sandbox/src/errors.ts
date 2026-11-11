/**
 * The sandbox session's fence proof isn't `fenced`, so the local tool's
 * program doesn't start, and it never starts on this computer instead. A
 * person's yes to run without the sandbox doesn't change this: that yes
 * covers plugin backends and integrations, never programs.
 */
export class SandboxNotFencedError extends Error {
  override readonly name = "SandboxNotFencedError";
  /** Why the fence isn't proven, as the sandbox adapter said it: one plain sentence. */
  readonly reason: string;

  constructor(connectorId: string, reason: string) {
    super(
      `Connector "${connectorId}" didn't start its program, because its sandbox isn't fenced: ${reason}`,
    );
    this.reason = reason;
  }
}

/**
 * The connector's sandbox session has ended, because its time limit ran out,
 * the run was cancelled or the session was closed. The connector starts
 * nothing more. The host checks for this error, closes the old session, and
 * opens a new session and connector for the next call.
 */
export class SandboxSessionEndedError extends Error {
  override readonly name = "SandboxSessionEndedError";

  constructor(connectorId: string) {
    super(
      `Connector "${connectorId}" can't reach its program: its sandbox session has ended. The next call starts it in a new session.`,
    );
  }
}
