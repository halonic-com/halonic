import type { DisplayPref, DisplayPrefs } from "../display-prefs.ts";

/** A theme setting for tests, as Appearance defines it. */
export const theme: DisplayPref<"system" | "light" | "dark"> = {
  key: "appearance.theme",
  fallback: "system",
  read: (stored) =>
    stored === "system" || stored === "light" || stored === "dark" ? stored : undefined,
};

/**
 * Display settings kept in memory. `failNext` makes the next write reject, `holdWrites` keeps
 * writes waiting until `release`, and `changeElsewhere` acts like another window.
 */
export class MemoryDisplayPrefs implements DisplayPrefs {
  readonly stored = new Map<string, unknown>();
  private readonly listeners = new Set<(key: string) => void>();
  private failures: unknown[] = [];
  private held: { finish: () => void }[] | undefined;

  read(key: string): unknown {
    return this.stored.get(key);
  }

  async write(key: string, value: unknown): Promise<void> {
    const failure = this.failures.shift();
    const finish = () => {
      if (failure !== undefined) {
        throw failure;
      }
      this.stored.set(key, value);
    };
    if (this.held === undefined) {
      finish();
      return;
    }
    const held = this.held;
    await new Promise<void>((resolve, reject) =>
      held.push({
        finish: () => {
          try {
            finish();
            resolve();
          } catch (reason) {
            reject(reason);
          }
        },
      }),
    );
  }

  subscribe(listener: (key: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  failNext(reason: unknown): void {
    this.failures.push(reason);
  }

  holdWrites(): void {
    this.held = [];
  }

  /** Lets held writes finish, in the order given by their index (0 = the first write). */
  release(...order: number[]): void {
    const held = this.held ?? [];
    for (const index of order) {
      held[index]?.finish();
    }
  }

  changeElsewhere(key: string, value: unknown): void {
    this.stored.set(key, value);
    for (const listener of this.listeners) {
      listener(key);
    }
  }
}
