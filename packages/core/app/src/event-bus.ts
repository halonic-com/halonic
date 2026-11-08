import { Emitter } from "@halonicjs/std";

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
 * Built on `Emitter` from `@halonicjs/std`, with the same rules: listeners
 * run in the order they were added, synchronously, and one added or removed
 * while an event is being sent takes effect from the next event. If a
 * listener throws, the others still run. With an `onListenerError` handler,
 * each error goes there as soon as its listener throws and `emit` returns
 * normally, so one faulty listener can't break whoever sent the event; the
 * workspace scope always uses one. Without it, `emit` throws that error (or
 * an `AggregateError` with all of them), which suits tests.
 */
export class EventBus<Events extends EventMap<Events>> {
  // Typed loosely inside: `Emitter` wants a string-keyed record, which an
  // interface such as `AppEvents` is not. `on` and `emit` check the types.
  private emitter = new Emitter<Record<PropertyKey, unknown>>();
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
    return this.emitter.on(name, this.reporting(name, listener) as EventListener<unknown>);
  }

  /**
   * Sends an event to every listener for it.
   *
   * @throws without an `onListenerError` handler: the error of the one
   *   listener that threw, or an `AggregateError` when several did
   */
  emit<Name extends keyof Events>(name: Name, payload: Events[Name]): void {
    this.emitter.emit(name, payload);
  }

  /** Removes every listener. The workspace scope calls this when it closes. */
  clear(): void {
    this.emitter = new Emitter();
  }

  /** The listener as the emitter gets it: with a handler, its errors go there instead of to `emit`. */
  private reporting<Name extends keyof Events>(
    name: Name,
    listener: EventListener<Events[Name]>,
  ): EventListener<Events[Name]> {
    const onListenerError = this.onListenerError;
    if (onListenerError === undefined) {
      return listener;
    }
    return (payload) => {
      try {
        listener(payload);
      } catch (error) {
        onListenerError(error, String(name));
      }
    };
  }
}
