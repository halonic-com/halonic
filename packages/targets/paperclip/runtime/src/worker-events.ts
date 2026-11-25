import type { PaperclipEvent } from "./host.ts";
import type { HostLink } from "./host-link.ts";
import { RpcError, rpcErrors } from "./worker-protocol.ts";

/**
 * The worker's Paperclip events: a listener asks Paperclip to send its event
 * (`events.subscribe`, refused like any call back when the manifest doesn't
 * declare it), and Paperclip's `onEvent` reaches the listeners for that
 * event. Neither a failed subscription nor a failing listener stops the
 * worker; both go to Paperclip's log, as the plugin SDK does.
 */

/** A listener for one kind of Paperclip event. */
export type EventListener = (event: PaperclipEvent) => Promise<void>;

/** A line for Paperclip's plugin log. */
export type WorkerLog = (level: "warn" | "error", message: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `onEvent`'s params, or refuses them. */
function readEvent(params: unknown): PaperclipEvent {
  const event = isRecord(params) ? params["event"] : undefined;
  const named =
    isRecord(event) &&
    typeof event["eventType"] === "string" &&
    typeof event["companyId"] === "string";
  if (!named) {
    throw new RpcError(
      rpcErrors.invalidParams,
      "onEvent needs an event with a type and a company.",
    );
  }
  return event as unknown as PaperclipEvent;
}

/** The listeners the plugin registered, by event name. */
export class WorkerEvents {
  readonly #link: HostLink;
  readonly #log: WorkerLog;
  readonly #listeners = new Map<string, Set<EventListener>>();

  constructor(link: HostLink, log: WorkerLog) {
    this.#link = link;
    this.#log = log;
  }

  /** Adds a listener; the first one for an event subscribes the worker to it. Returns its removal. */
  on(name: string, listener: EventListener): () => void {
    let listeners = this.#listeners.get(name);
    if (listeners === undefined) {
      listeners = new Set();
      this.#listeners.set(name, listeners);
      this.#subscribe(name);
    }
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }

  /** Hands Paperclip's event to each of its listeners, one after another. */
  async deliver(params: unknown): Promise<null> {
    const event = readEvent(params);
    for (const listener of this.#listeners.get(event.eventType) ?? []) {
      try {
        await listener(event);
      } catch (error) {
        this.#log("error", `the ${event.eventType} listener failed: ${(error as Error).message}`);
      }
    }
    return null;
  }

  #subscribe(name: string): void {
    const params = { eventPattern: name, filter: null };
    this.#link.call({ method: "events.subscribe", params }).catch((error: unknown) => {
      this.#log("warn", `the worker isn't subscribed to ${name}: ${(error as Error).message}`);
    });
  }
}
