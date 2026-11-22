import type { PluginApiRequestInput, PluginApiResponse } from "@paperclipai/plugin-sdk";
import type { SeatEvent } from "../records.ts";
import type { SeatReadStatus } from "./seats-reader.ts";
import { publicSeat, type SeatSetting, type SeatsSettings } from "./settings.ts";
import type { SeatsStore } from "./store.ts";

export interface SeatsRouteDeps {
  readonly readSettings: (companyId: string) => Promise<SeatsSettings>;
  readonly store: SeatsStore;
  readonly now: () => Date;
  /** The reads as `seats.read` has them in memory now. */
  readonly reads: (seats: readonly SeatSetting[]) => SeatsReadView;
}

/** What the seat list shows about the reads: since the worker started, each seat's state. */
export interface SeatsReadView {
  /** When the worker started; every seat's back-off and alerts count from then. */
  readonly readerStartedAt: string;
  readonly seats: readonly SeatReadStatus[];
}

/**
 * The plugin's routes. The manifest declares each one `auth: "board"`, so
 * Paperclip lets only board users through; this checks it a second time and
 * refuses anyone who isn't a signed-in user, so an agent can never record a
 * reset or, later, start a sign-in, even if a route is declared wrong.
 */
export async function handleSeatsRequest(
  input: PluginApiRequestInput,
  deps: SeatsRouteDeps,
): Promise<PluginApiResponse> {
  const boardUserId = input.actor.actorType === "user" ? input.actor.userId : undefined;
  if (typeof boardUserId !== "string" || boardUserId === "") {
    return refuse(403, "Only the board can use the AI seats routes.");
  }
  const settings = await deps.readSettings(input.companyId);
  switch (input.routeKey) {
    case "seats.list":
      return {
        status: 200,
        body: {
          seats: settings.seats.map(publicSeat),
          movesEnabled: settings.movesEnabled,
          reads: deps.reads(settings.seats),
        },
      };
    case "seats.manual-reset":
      return await recordManualReset(input.params["seatId"], boardUserId, settings, deps);
    default:
      return refuse(404, "No such AI seats route.");
  }
}

async function recordManualReset(
  seatId: string | undefined,
  boardUserId: string,
  settings: SeatsSettings,
  deps: SeatsRouteDeps,
): Promise<PluginApiResponse> {
  const seat = settings.seats.find((candidate) => candidate.id === seatId);
  if (seat === undefined) {
    return refuse(404, "No seat with that id in the plugin's settings.");
  }
  const used = await usedManualReset(seat, settings, deps.store);
  if (used !== undefined) {
    return refuse(
      409,
      `A manual reset is already recorded for ${used.seatId} at ${used.at}, and seats in one reset group share one manual reset.`,
    );
  }
  const event = {
    seatId: seat.id,
    kind: "manual-reset",
    at: deps.now().toISOString(),
    by: "board",
  } as const;
  await deps.store.recordEvent({ ...event, boardUserId });
  return { status: 201, body: { event } };
}

/**
 * The manual reset already recorded for the seat's reset group, if any. A
 * seat without a group counts as a group of its own.
 */
async function usedManualReset(
  seat: SeatSetting,
  settings: SeatsSettings,
  store: SeatsStore,
): Promise<SeatEvent | undefined> {
  const groupOf = (candidate: SeatSetting) => candidate.resetGroup ?? `seat:${candidate.id}`;
  const sameGroup = new Set(
    settings.seats.filter((other) => groupOf(other) === groupOf(seat)).map((other) => other.id),
  );
  return (await store.manualResets()).find((event) => sameGroup.has(event.seatId));
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}
