import type { UnfencedRunConsent, UnfencedRunConsentStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty store under test, and a way to damage what it holds. */
export interface UnfencedRunConsentStoreHarness {
  store: UnfencedRunConsentStore;
  /**
   * Makes the saved yes unreadable, the way a damaged or hand-edited file
   * would be. The suite only damages a yes it saved.
   */
  damage(): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeUnfencedRunConsentStore = () => Promise<UnfencedRunConsentStoreHarness>;

/**
 * A yes for `reason`. The time is one no error may hold: it stands for the
 * contents of a yes that can't be read.
 */
export function unfencedRunConsent(reason = "windows"): UnfencedRunConsent {
  return { reason, allowedAt: "2026-11-09T10:00:00.000Z" };
}

/**
 * The contract every {@link UnfencedRunConsentStore} adapter passes. The
 * port only stores; `UnfencedRuns` decides. A yes lets code run without the
 * sandbox, so the store fails closed: it never invents one.
 */
export function unfencedRunConsentStoreContract(
  name: string,
  make: MakeUnfencedRunConsentStore,
): void {
  verifies("contracts.unfenced-run-consent-store", () => {
    describe(`UnfencedRunConsentStore contract: ${name}`, () => {
      storageCases(make);
      damageCases(make);
    });
  });
}

function storageCases(make: MakeUnfencedRunConsentStore): void {
  it("starts with no yes, and gives back every field of a saved one", async () => {
    const { store } = await make();
    expect(await store.get()).toBeNull();

    await store.save(unfencedRunConsent());
    expect(await store.get()).toEqual(unfencedRunConsent());
  });

  it("replaces the yes when another is saved, so only the last reason holds", async () => {
    const { store } = await make();
    await store.save(unfencedRunConsent("container"));
    const later = { reason: "bubblewrap-missing", allowedAt: "2026-11-10T08:30:00.000Z" };
    await store.save(later);
    expect(await store.get()).toEqual(later);
  });

  it("removes the yes, and removing none is not an error", async () => {
    const { store } = await make();
    await store.save(unfencedRunConsent());
    await store.remove();
    expect(await store.get()).toBeNull();
    await store.remove();
    expect(await store.get()).toBeNull();
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = unfencedRunConsent("container");
    await store.save(saved);
    saved.reason = "windows";

    const read = await store.get();
    expect(read).toEqual(unfencedRunConsent("container"));
    if (read !== null) read.reason = "windows";
    expect(await store.get()).toEqual(unfencedRunConsent("container"));
  });
}

function damageCases(make: MakeUnfencedRunConsentStore): void {
  it("throws, and keeps the yes's contents out of the error, when it can't be read", async () => {
    const { store, damage } = await make();
    await store.save(unfencedRunConsent("container"));
    await damage();

    // Never null without telling the user why, and never a yes: a store that
    // hid the damage could also hide a swapped-in yes.
    const error = await store.get().then(
      () => expect.fail("get gave a yes that can't be read"),
      (caught: unknown) => caught,
    );
    // The message and every cause: a parser's error can quote the text it read.
    const text = errorText(error);
    expect(text).not.toContain("2026-11-09T10:00:00.000Z");
    expect(text).not.toContain("container");
  });

  it("removes a yes that can't be read, so the user can recover", async () => {
    const { store, damage } = await make();
    await store.save(unfencedRunConsent());
    await damage();
    await store.remove();
    expect(await store.get()).toBeNull();
  });

  it("replaces a yes that can't be read when another is saved", async () => {
    const { store, damage } = await make();
    await store.save(unfencedRunConsent());
    await damage();
    await store.save(unfencedRunConsent("container"));
    expect(await store.get()).toEqual(unfencedRunConsent("container"));
  });
}

/** The message of an error and of each of its causes, one per line. */
function errorText(error: unknown): string {
  const lines: string[] = [];
  let current = error;
  for (let depth = 0; current !== undefined && depth < 10; depth++) {
    if (!(current instanceof Error)) {
      lines.push(String(current));
      break;
    }
    lines.push(current.message);
    current = current.cause;
  }
  return lines.join("\n");
}
