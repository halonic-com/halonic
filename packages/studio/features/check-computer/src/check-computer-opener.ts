import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

/**
 * Whether Check this computer is open in this window. The command opens it; the dialog host draws
 * it and closes it. Each opening counts, so a dialog opened again starts a fresh check.
 */
export class CheckComputerOpener {
  #opening: number | undefined;
  #openings = 0;
  readonly #listeners = new Set<() => void>();

  /** The number of the opening that is showing, or `undefined` when the dialog is closed. */
  readonly current = (): number | undefined => this.#opening;

  /** Calls `listener` each time the dialog opens or closes; returns the way to stop. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Opens the dialog; one that is open already stays as it is. */
  open(): void {
    if (this.#opening !== undefined) return;
    this.#openings += 1;
    this.#set(this.#openings);
  }

  close(): void {
    this.#set(undefined);
  }

  #set(opening: number | undefined): void {
    this.#opening = opening;
    for (const listener of this.#listeners) listener();
  }
}

/** The window's opener, which the feature provides for each open folder. */
export const CheckComputerOpenerService: ServiceKey<CheckComputerOpener> =
  serviceKey<CheckComputerOpener>("check-computer.opener");
