import type { UnfencedRunConsent, UnfencedRunConsentStore } from "@halonicjs/ports";

/**
 * A small in-memory `UnfencedRunConsentStore` for the kernel's own tests,
 * with a way to make the yes unreadable. A deliberate fake: core may not
 * use adapters, not even in tests.
 */
export class TestUnfencedRunConsentStore implements UnfencedRunConsentStore {
  private saved: UnfencedRunConsent | null = null;
  private unreadable = false;

  async get(): Promise<UnfencedRunConsent | null> {
    if (this.unreadable) {
      throw new Error("the saved yes can't be read");
    }
    return this.saved === null ? null : { ...this.saved };
  }

  async save(consent: UnfencedRunConsent): Promise<void> {
    this.unreadable = false;
    this.saved = { ...consent };
  }

  async remove(): Promise<void> {
    this.unreadable = false;
    this.saved = null;
  }

  /** Makes `get` throw until a yes is saved or removed. */
  breakConsent(): void {
    this.unreadable = true;
  }
}
