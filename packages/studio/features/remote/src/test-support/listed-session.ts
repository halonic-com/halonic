import type { GatewaySession } from "@halonicjs/ports";

/** A session as the host lists it, with `overrides` on top. */
export function listedSession(overrides: Partial<GatewaySession> = {}): GatewaySession {
  return {
    id: "session-1",
    title: "Weekly report",
    state: "running",
    lastSeq: 0,
    updatedAt: "2026-11-21T14:02:00.000Z",
    ...overrides,
  };
}
