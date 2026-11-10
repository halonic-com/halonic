import type { RestartLimits } from "./restart-limit.ts";

/**
 * A connector whose program kept stopping, so it won't start it again
 * until the connector is created again. The message is ours; the last
 * lines the program wrote to its standard error, with keys and personal
 * data removed, are kept apart in `errorOutput`.
 */
export class ConnectorStoppedError extends Error {
  override readonly name = "ConnectorStoppedError";
  /** The program's last error output, cleaned (`cleanErrorOutput`): the program's text, not ours. */
  readonly errorOutput: readonly string[];

  constructor(connectorId: string, limits: RestartLimits, errorOutput: readonly string[]) {
    const minutes = Math.round(limits.windowMs / 60_000);
    super(
      `Connector "${connectorId}" stopped: its program ended again after ${limits.maxRestarts} restarts within ${minutes} minutes, so Halonic doesn't start it again. It stays stopped until the connector is created again.`,
    );
    this.errorOutput = errorOutput;
  }
}
