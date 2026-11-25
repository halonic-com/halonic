import { parse, s } from "@halonicjs/schema-kit";
import {
  MAX_NEARBY,
  type NearbyComputer,
  type NearbyComputers,
  type NearbyId,
  type NearbyStart,
} from "@halonicjs/studio-feature-remote/phone";
import { TauriChannel } from "@halonicjs/studio-services/tauri-channel";
import type { TauriCallbacks, TauriIpc } from "@halonicjs/studio-services/tauri-ipc";
import type { Report } from "./phone-tunnel-answers.ts";

/** The longest name the shell lists, in UTF-8 bytes, as for the pairing name. */
const MAX_NAME_BYTES = 64;

const startSchema = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("browsing") }).strict(),
  s.object({ kind: s.literal("no-local-network"), askAgain: s.boolean() }).strict(),
  s.object({ kind: s.literal("unavailable") }).strict(),
]);

const eventSchema = s
  .object({
    kind: s.literal("computers"),
    computers: s.array(s.object({ id: s.string(), name: s.string() }).strict()),
  })
  .strict();

const unavailable: NearbyStart = { kind: "unavailable" };

/**
 * The typed route's list of computers on this Wi-Fi in the Android app: `browse` and `stop` go
 * to the shell's `phone_nearby_browse` and `phone_nearby_stop` (`src-tauri/src/phone_nearby.rs`,
 * granted to the phone's own page by `capabilities/phone-nearby.json`). The shell keeps each
 * computer's address; the page gets names and ids only.
 *
 * - **One browse:** each browse has its own channel, closed when it is stopped or replaced, so a
 *   list the shell sent to an older browse never reaches the newer picker.
 * - **No list before `browsing`:** the shell sends the empty list before it knows whether
 *   Android's search started, so the adapter holds lists until the answer, and drops them when
 *   it isn't `browsing`.
 * - **The network isn't trusted:** the shell already checks every computer, and the page checks
 *   again: at most {@link MAX_NEARBY}, names trimmed, not empty and at most 64 bytes, sorted by
 *   name. An answer or list the page doesn't know goes to `report`; a browse reads it as
 *   `unavailable`, a list is dropped.
 */
export class TauriNearbyComputers implements NearbyComputers {
  readonly #ipc: TauriIpc & TauriCallbacks;
  readonly #report: Report;
  #channel: TauriChannel | undefined;

  constructor(ipc: TauriIpc & TauriCallbacks, report: Report) {
    this.#ipc = ipc;
    this.#report = report;
  }

  async browse(onChange: (computers: readonly NearbyComputer[]) => void): Promise<NearbyStart> {
    this.#channel?.close();
    let started = false;
    let held: readonly NearbyComputer[] | undefined;
    const channel = new TauriChannel(this.#ipc, (raw) => {
      const computers = readComputers(raw, this.#report);
      if (computers === undefined) return;
      if (started) onChange(computers);
      else held = computers;
    });
    this.#channel = channel;
    const answer = await this.#ipc
      .invoke("phone_nearby_browse", { onEvent: channel.argument })
      .catch((error: unknown) => {
        channel.close();
        throw error;
      });
    const start = readStart(answer, this.#report);
    // Stopped or replaced while Android's question showed: this browse tells no one.
    if (this.#channel !== channel) return start;
    if (start.kind !== "browsing") {
      channel.close();
      this.#channel = undefined;
      return start;
    }
    started = true;
    if (held !== undefined) onChange(held);
    return start;
  }

  async stop(): Promise<void> {
    this.#channel?.close();
    this.#channel = undefined;
    await this.#ipc.invoke("phone_nearby_stop");
  }
}

/**
 * The list of computers on this Wi-Fi in the Android app, or `undefined` outside the shell.
 *
 * @param ipc - the shell's commands and callbacks, from `tauriChannelIpc`
 * @param report - where an answer the page doesn't know goes, for the log
 */
export function tauriNearbyComputers(
  ipc: (TauriIpc & TauriCallbacks) | undefined,
  report: Report,
): TauriNearbyComputers | undefined {
  return ipc === undefined ? undefined : new TauriNearbyComputers(ipc, report);
}

/** The answer to `phone_nearby_browse`. */
function readStart(answer: unknown, report: Report): NearbyStart {
  const parsed = parse(startSchema, answer);
  if (parsed.ok) return parsed.value;
  report("phone_nearby_browse gave an answer the page doesn't know");
  return unavailable;
}

/** One list from the browse's channel, checked again, or `undefined` for one the page doesn't know. */
export function readComputers(raw: unknown, report: Report): readonly NearbyComputer[] | undefined {
  const parsed = parse(eventSchema, raw);
  if (!parsed.ok) {
    report("phone_nearby_browse sent a list the page doesn't know");
    return undefined;
  }
  const encoder = new TextEncoder();
  return parsed.value.computers
    .map(({ id, name }) => ({ id: id as NearbyId, name: name.trim() }))
    .filter(({ id, name }) => {
      return id !== "" && name !== "" && encoder.encode(name).length <= MAX_NAME_BYTES;
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_NEARBY);
}
