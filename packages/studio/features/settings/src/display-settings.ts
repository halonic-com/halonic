import type { DisplayPref, DisplayPrefs } from "./display-prefs.ts";

/**
 * How a save ended. A failed one has put the stored value back in `back`, unless a newer change to
 * the same setting came in meanwhile (`superseded`): then nothing went back, and the newer change's
 * outcome is the one to tell the user.
 */
export type SaveOutcome<Value> =
  | { readonly saved: true }
  | {
      readonly saved: false;
      readonly superseded: false;
      readonly reason: unknown;
      readonly back: Value;
    }
  | { readonly saved: false; readonly superseded: true; readonly reason: unknown };

/**
 * The display settings as Settings and the rest of the window read them, saving by themselves
 * (board, HAL-1102): a change shows at once and is stored straight away, with no Save button and
 * no Undo. When storing fails, the value from before comes back and the failure stays on that
 * setting until it next saves, so Settings can show it under the control
 * (`settings.failed-save`). Settings says it in the dialog, never in a toast.
 *
 * @example
 * const settings = new DisplaySettings(new BrowserDisplayPrefs(window.localStorage, window));
 * const outcome = await settings.set(theme, "dark");
 * if (!outcome.saved && !outcome.superseded) announce(`Couldn't save the theme on this computer. Theme is back to ${outcome.back}.`);
 */
export class DisplaySettings {
  private readonly prefs: DisplayPrefs;
  /**
   * Each setting's value as this window shows it: read once from the store, so `get` gives the
   * same object each time (as `useSyncExternalStore` needs), and ahead of the store while saving.
   * Only kept up to date while someone listens, so it is read again when listening starts or stops.
   */
  private readonly shown = new Map<string, unknown>();
  private readonly failures = new Map<string, unknown>();
  /**
   * The latest save of each key while it is saving, so an older save that ends later can't undo a
   * newer one, and a change from another window doesn't overwrite a value that is still saving.
   */
  private readonly latest = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private saves = 0;
  private stopListening: (() => void) | undefined;

  constructor(prefs: DisplayPrefs) {
    this.prefs = prefs;
  }

  /** The setting's value: the one set here, else the stored one, else its fallback. */
  get<Value>(pref: DisplayPref<Value>): Value {
    if (!this.shown.has(pref.key)) {
      this.shown.set(pref.key, pref.read(this.prefs.read(pref.key)) ?? pref.fallback);
    }
    return this.shown.get(pref.key) as Value;
  }

  /** Why the setting's last save failed, or `undefined` when it saved or wasn't changed. */
  failure(pref: DisplayPref<unknown>): unknown {
    return this.failures.get(pref.key);
  }

  /**
   * Shows `value` at once and stores it. On a failure the stored value comes back (the value from
   * before, or one another window stored meanwhile), unless a newer change to the same setting came
   * in meanwhile.
   */
  async set<Value>(pref: DisplayPref<Value>, value: Value): Promise<SaveOutcome<Value>> {
    const save = ++this.saves;
    this.latest.set(pref.key, save);
    this.shown.set(pref.key, value);
    this.changed();
    try {
      await this.prefs.write(pref.key, value);
    } catch (reason) {
      if (!this.ended(pref.key, save)) {
        return { saved: false, superseded: true, reason };
      }
      // Not the value shown before this change: that may be an earlier change that never got
      // stored, or hide one another window stored while this one was saving.
      this.shown.delete(pref.key);
      const back = this.get(pref);
      this.failures.set(pref.key, reason);
      this.changed();
      return { saved: false, superseded: false, reason, back };
    }
    if (this.ended(pref.key, save)) {
      this.failures.delete(pref.key);
      this.changed();
    }
    return { saved: true };
  }

  /**
   * Calls `listener` after any setting changes, here or in another window. Fits React's
   * `useSyncExternalStore` together with `get`.
   *
   * @returns a function that stops listening
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.stopListening === undefined) {
      this.stopListening = this.prefs.subscribe((key) => this.changedElsewhere(key));
      this.forgetShown();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopListening?.();
        this.stopListening = undefined;
        this.forgetShown();
      }
    };
  }

  /** Drops the shown values that aren't saving, which may have changed elsewhere unheard. */
  private forgetShown(): void {
    for (const key of this.shown.keys()) {
      if (!this.latest.has(key)) {
        this.shown.delete(key);
      }
    }
  }

  /** Whether `save` was the latest of `key`; if so, the key is no longer saving. */
  private ended(key: string, save: number): boolean {
    if (this.latest.get(key) !== save) {
      return false;
    }
    this.latest.delete(key);
    return true;
  }

  /** A value stored by another window wins over the one shown here, unless this one is saving. */
  private changedElsewhere(key: string): void {
    if (this.latest.has(key)) {
      return;
    }
    this.shown.delete(key);
    this.failures.delete(key);
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
