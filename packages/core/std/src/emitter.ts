/** A function that receives one kind of event. */
export type Listener<Payload> = (payload: Payload) => void;

/**
 * A small typed event emitter. `Events` maps each event name to the type of
 * its payload, so `emit` and `on` check both.
 *
 * Listeners run in the order they were added. A listener added or removed
 * while an event is being sent takes effect from the next event. If a
 * listener throws, the others still run, and `emit` then throws the error
 * (or an `AggregateError` with all of them).
 *
 * @example
 * const changes = new Emitter<{ saved: { path: string }; closed: undefined }>();
 * const stop = changes.on("saved", ({ path }) => console.log(path));
 * changes.emit("saved", { path: "hubs/support/hub.yaml" });
 * stop();
 */
export class Emitter<Events extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  /**
   * Adds a listener for one event.
   *
   * @param name - the event to listen to
   * @param listener - called with each payload
   * @returns a function that removes the listener again; calling it twice is harmless
   */
  on<Name extends keyof Events>(name: Name, listener: Listener<Events[Name]>): () => void {
    let forName = this.listeners.get(name);
    if (forName === undefined) {
      forName = new Set();
      this.listeners.set(name, forName);
    }
    // Wrapped, so adding the same function twice gives two independent listeners.
    const entry: Listener<Events[Name]> = (payload) => listener(payload);
    forName.add(entry);
    return () => {
      forName.delete(entry);
    };
  }

  /**
   * Sends an event to every listener for it.
   *
   * @param name - the event
   * @param payload - what the listeners receive
   * @throws the error of the one listener that threw, or an `AggregateError` when several did
   */
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const forName = this.listeners.get(name);
    if (forName === undefined) {
      return;
    }
    const errors: unknown[] = [];
    for (const listener of [...forName] as Listener<Events[Name]>[]) {
      try {
        listener(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} listeners for "${String(name)}" failed.`);
    }
  }

  /**
   * How many listeners an event has.
   *
   * @param name - the event
   */
  listenerCount(name: keyof Events): number {
    return this.listeners.get(name)?.size ?? 0;
  }
}
