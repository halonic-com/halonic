import type { ChosenFormat } from "../window/window-format.tsx";

/** The format chosen in Settings → Formats, kept in memory: a test changes it with `choose`. */
export class FakeChosenFormat implements ChosenFormat {
  private chosen: string | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(chosen?: string) {
    this.chosen = chosen;
  }

  get = (): string | undefined => this.chosen;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Chooses `tag`, or "Follow this computer" when undefined, and tells every listener. */
  choose(tag: string | undefined): void {
    this.chosen = tag;
    for (const listener of this.listeners) listener();
  }
}
