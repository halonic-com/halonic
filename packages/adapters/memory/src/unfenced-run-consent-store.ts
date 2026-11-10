import type { UnfencedRunConsent, UnfencedRunConsentStore } from "@halonicjs/ports";

/**
 * The user's yes to run plugin and integration code without the sandbox, in
 * memory, for tests and the browser demo. It is kept as JSON text, the way
 * a file in the user's profile would hold it, so every read gives a fresh
 * copy and a damaged yes can be modelled.
 */
export class MemoryUnfencedRunConsentStore implements UnfencedRunConsentStore {
  #text: string | undefined;

  async get(): Promise<UnfencedRunConsent | null> {
    return this.#text === undefined ? null : parseConsent(this.#text);
  }

  async save(consent: UnfencedRunConsent): Promise<void> {
    this.#text = JSON.stringify(consent);
  }

  async remove(): Promise<void> {
    this.#text = undefined;
  }

  /**
   * For tests: makes the saved yes unreadable, as a file cut off halfway
   * would be. `get` then throws, and `remove` still deletes it.
   *
   * @throws when there is no yes, so a test can't damage one it never saved
   */
  damage(): void {
    if (this.#text === undefined) {
      throw new Error("There is no saved yes to damage.");
    }
    this.#text = this.#text.slice(0, -1);
  }
}

function parseConsent(text: string): UnfencedRunConsent {
  try {
    return JSON.parse(text) as UnfencedRunConsent;
  } catch {
    // No `cause`: the parser's message can quote the text it read.
    throw new Error(
      "The saved yes to run plugins and integrations without the sandbox can't be read.",
    );
  }
}
