import type { SyncDiagnostics } from "@halonicjs/ports";
import { type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const count = s.number().int().min(0);
const ms = s.number().min(0);
const update = s.object({ count, share: s.number().min(0).max(1) }).strict();
const timing = { count, p50Ms: ms.nullable(), p95Ms: ms.nullable() };
const connection = s.enum(["connected", "polling-only", "not-allowed"]);

const diagnosticsAnswer: Schema<SyncDiagnostics> = s
  .object({
    windowMs: ms,
    updates: s.object({ event: update, poll: update, "catch-up": update, write: update }).strict(),
    eventLag: s.object(timing).strict(),
    pollLag: s.object(timing).strict(),
    missedByEvents: count,
    reconnects: count,
    connection,
    timeIn: s.object({ connected: ms, "polling-only": ms, "not-allowed": ms }).strict(),
    routes: s.array(
      s
        .object({
          method: s.string().max(16),
          route: s.string().max(512),
          ...timing,
          failed: count,
          bytes: count,
        })
        .strict(),
    ),
  })
  .strict();

/**
 * The agent host's sync diagnostics (requirement `agent-host.sync-diagnostics`): counts and
 * timings of the last 24 hours, for Settings › Sync diagnostics. An answer of another shape is
 * refused, not shown.
 */
export class AgentHostSyncDiagnostics {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /** Reads the counts and timings as they are now. */
  async read(): Promise<SyncDiagnostics> {
    const route = "GET /v1/sync/diagnostics";
    return readAnswer(route, await this.#transport.request(route), diagnosticsAnswer);
  }
}
