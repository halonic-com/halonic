import type { AskKeysSettings } from "@halonicjs/studio-feature-quick-ask/api";
import type { AskKeysText } from "../api.ts";
import { shortcutKeys, shortcutText } from "../settings/shortcut-keys.ts";

/**
 * Quick ask's keys as a sentence names them, read from the shell through `settings`: on the first
 * subscriber or the first read, and again each time Settings saves new ones. Without `settings`, as
 * in any window but Studio's own, it names none.
 */
export class AskKeysWatch implements AskKeysText {
  private text: string | undefined;
  private started = false;
  private readonly listeners = new Set<() => void>();
  private readonly settings: AskKeysSettings | undefined;

  constructor(settings: AskKeysSettings | undefined) {
    this.settings = settings;
  }

  /**
   * The keys now. The first call starts the read, since the Ctrl K list may be the first to ask,
   * before anything subscribed; until the shell answers there are none.
   */
  readonly current = (): string | undefined => {
    this.start();
    return this.text;
  };

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  };

  private start(): void {
    if (this.started || this.settings === undefined) return;
    this.started = true;
    this.settings.subscribe?.(() => this.read());
    this.read();
  }

  /** Reads the keys; keys that don't work name nothing. A failed read is said in the console. */
  private read(): void {
    const settings = this.settings;
    if (settings === undefined) return;
    settings.keys().then(
      (keys) => {
        const { platform } = settings;
        const text =
          keys.state === "on"
            ? shortcutText(shortcutKeys(keys.shortcut, platform), platform)
            : undefined;
        if (text === this.text) return;
        this.text = text;
        for (const listener of [...this.listeners]) listener();
      },
      (error: unknown) => console.error("Quick ask's keys couldn't be read:", error),
    );
  }
}
