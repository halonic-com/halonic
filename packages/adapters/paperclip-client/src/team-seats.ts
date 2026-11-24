import type { Seat, SeatState, SeatWindow } from "@halonicjs/ports";
import type { PaperclipIds } from "./ids.ts";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";

const roles: Readonly<Record<string, Seat["role"]>> = {
  pool: "pool",
  reserve: "reserve",
  "paid-api": "paid-api",
};

const windowKinds: Readonly<Record<string, SeatWindow["kind"]>> = {
  "five-hour": "five-hour",
  week: "week",
  "model-week": "model-week",
};

/** The most-used window's percentage at which a seat reads as full, or near its limit. */
const fullPercent = 100;
const nearLimitPercent = 90;

function percentOf(record: JsonRecord): number | undefined {
  const value = field(record, "usedPercent");
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toWindow(record: JsonRecord): SeatWindow | undefined {
  const usedPercent = percentOf(record);
  if (usedPercent === undefined) {
    return undefined;
  }
  const resetsAt = text(record, "resetsAt");
  const reaches90At = text(record, "reaches90At");
  return {
    kind: windowKinds[text(record, "kind") ?? ""] ?? "other",
    label: text(record, "label") ?? "",
    usedPercent,
    ...(resetsAt === undefined ? {} : { resetsAt }),
    ...(reaches90At === undefined ? {} : { reaches90At }),
  };
}

function stateOf(record: JsonRecord, windows: readonly SeatWindow[]): SeatState {
  if (text(record, "lastError") === "signed-out") {
    return "signed-out";
  }
  if (field(record, "readable") !== true) {
    return "not-read";
  }
  const most = Math.max(0, ...windows.map((window) => window.usedPercent));
  if (most >= fullPercent) {
    return "full";
  }
  return most >= nearLimitPercent ? "near-limit" : "ok";
}

/**
 * The seats of a `seats/summary` answer, by their board label only. Each
 * field is picked by name, so anything else the route might send (an
 * account, a folder, a connection) never reaches a `Seat`. The route has
 * one proposal for the whole pool, so it goes on each pool seat. The route
 * says only whether the manual reset is used, not when, so a used one reads
 * as `none` left.
 */
export function toSeats(ids: PaperclipIds, answer: unknown): Seat[] {
  const summary = asRecord(answer);
  const at = text(summary, "at") ?? new Date(0).toISOString();
  const proposalRecord = asRecord(field(summary, "proposal"));
  const proposalText = text(proposalRecord, "text");
  const proposal =
    proposalText === undefined
      ? undefined
      : { text: proposalText, at: text(proposalRecord, "at") ?? at };
  return asRecords(field(summary, "seats")).flatMap((record) => {
    const id = text(record, "id");
    if (id === undefined) {
      return [];
    }
    const windows = asRecords(field(record, "windows")).flatMap((window) => toWindow(window) ?? []);
    const role = roles[text(record, "role") ?? ""] ?? "other";
    const seat: Seat = {
      id: ids.make("seat", id),
      source: ids.source(),
      asOf: text(record, "asOf") ?? at,
      label: text(record, "label") ?? id,
      role,
      state: stateOf(record, windows),
      windows,
      agents: asRecords(field(record, "agents")).flatMap((agent) => {
        const agentId = text(agent, "agentId");
        return agentId === undefined ? [] : [ids.make("agent", agentId)];
      }),
      manualReset: field(record, "manualResetUsed") === true ? "none" : "available",
      ...(proposal !== undefined && role === "pool" ? { proposal } : {}),
    };
    return [seat];
  });
}
