import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { agentSeat, type SeatSignIn } from "./agent-seat.ts";

// Made-up seats, folders and connection ids only.
const seats: SeatSignIn[] = [
  { id: "seat-a", configDir: "/srv/seats/a", connectionId: "conn-a" },
  { id: "seat-b", configDir: "/srv/seats/b/", connectionId: "conn-b" },
];

verifies("paperclip.seats-history", () => {
  test("an agent is on the seat whose connection its settings name", () => {
    expect(agentSeat({ configDir: undefined, connectionId: "conn-b" }, seats)).toBe("seat-b");
  });

  test("a folder of its own decides before its connection", () => {
    expect(agentSeat({ configDir: "/srv/seats/b", connectionId: "conn-a" }, seats)).toBe("seat-b");
    expect(agentSeat({ configDir: "/srv/seats/a/", connectionId: "conn-b" }, seats)).toBe("seat-a");
  });

  test("an agent with another sign-in is on no seat", () => {
    expect(agentSeat({ configDir: undefined, connectionId: "conn-other" }, seats)).toBeUndefined();
    expect(agentSeat({ configDir: undefined, connectionId: undefined }, seats)).toBeUndefined();
    expect(
      agentSeat({ configDir: "/srv/agents/agent-1/.claude", connectionId: "conn-a" }, seats),
    ).toBeUndefined();
  });

  test("a seat without a connection id takes no agent by connection", () => {
    const noConnection = [{ id: "seat-c", configDir: "/srv/seats/c", connectionId: undefined }];
    expect(
      agentSeat({ configDir: undefined, connectionId: undefined }, noConnection),
    ).toBeUndefined();
  });
});
