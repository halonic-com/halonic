/** A map from event names to the type of their payload. */
export type EventMap<Events> = { [Name in keyof Events]: unknown };

/** Receives one kind of event. */
export type EventListener<Payload> = (payload: Payload) => void;

/** Receives the error of a listener that threw, with the name of the event it was handling. */
export type ListenerErrorHandler = (error: unknown, eventName: string) => void;

/**
 * Typed events inside one open workspace, such as "files changed". Commands
 * change things; events tell everyone else that something changed.
 *
 * Listeners run in the order they were added, synchronously. One added or
 * removed while an event is being sent takes effect from the next event. If
 * a listener throws, the others still run. With an `onListenerError`
 * handler, each error goes there and `emit` returns normally, so one faulty
 * listener can't break whoever sent the event; the workspace scope always
 * uses one. Without it, `emit` throws that error (or an `AggregateError`
 * with all of them), which suits tests.
 *
 * Same rules as `Emitter` in `@halonicjs/std`; the bus switches to it once
 * std is on this package's base (HAL-104).
 */
export class EventBus<Events extends EventMap<Events>> {
  private readonly listeners = new Map<keyof Events, Set<EventListener<never>>>();
  private readonly onListenerError: ListenerErrorHandler | undefined;

  /**
   * @param onListenerError - receives each listener's error instead of `emit` throwing it
   */
  constructor(onListenerError?: ListenerErrorHandler) {
    this.onListenerError = onListenerError;
  }

  /**
   * Adds a listener for one event.
   *
   * @returns a function that removes the listener again; calling it twice is harmless
   */
  on<Name extends keyof Events>(name: Name, listener: EventListener<Events[Name]>): () => void {
    let forName = this.listeners.get(name);
    if (forName === undefined) {
      forName = new Set();
      this.listeners.set(name, forName);
    }
    // Wrapped, so adding the same function twice gives two independent listeners.
    const entry: EventListener<Events[Name]> = (payload) => listener(payload);
    forName.add(entry);
    return () => {
      forName.delete(entry);
    };
  }

  /**
   * Sends an event to every listener for it.
   *
   * @throws without an `onListenerError` handler: the error of the one
   *   listener that threw, or an `AggregateError` when several did
   */
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    const forName = this.listeners.get(name);
    if (forName === undefined) {
      return;
    }
    const errors: unknown[] = [];
    for (const listener of [...forName] as EventListener<Events[Name]>[]) {
      try {
        listener(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    if (this.onListenerError !== undefined) {
      for (const error of errors) {
        this.onListenerError(error, String(name));
      }
      return;
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, `${errors.length} listeners for "${String(name)}" failed.`);
    }
  }

  /** Removes every listener. The workspace scope calls this when it closes. */
  clear(): void {
    this.listeners.clear();
  }
}
