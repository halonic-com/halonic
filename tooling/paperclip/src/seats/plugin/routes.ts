import type { PluginApiRequestInput, PluginApiResponse } from "@paperclipai/plugin-sdk";
import { publicSeat, type SeatsSettings } from "./settings.ts";
import type { SeatsStore } from "./store.ts";

export interface SeatsRouteDeps {
  readonly readSettings: (companyId: string) => Promise<SeatsSettings>;
  readonly store: SeatsStore;
  readonly now: () => Date;
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
        body: { seats: settings.seats.map(publicSeat), movesEnabled: settings.movesEnabled },
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
  const event = {
    seatId: seat.id,
    kind: "manual-reset",
    at: deps.now().toISOString(),
    by: "board",
  } as const;
  await deps.store.recordEvent({ ...event, boardUserId });
  return { status: 201, body: { event } };
}

function refuse(status: number, message: string): PluginApiResponse {
  return { status, body: { error: message } };
}
