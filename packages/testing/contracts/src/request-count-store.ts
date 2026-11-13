import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/**
 * What a request-count store does, for the daily request ceiling. It matches
 * `RequestCountStore` in `host/server`; this suite can't import that package,
 * because the testing layer sits below the host layer.
 */
export interface RequestCountStoreUnderTest {
  countRequest(day: string, limit: number): Promise<{ allowed: boolean; count: number }>;
}

/**
 * Makes the store under test. `reopen` gives a store over the data the last
 * one wrote, the way a host restart does.
 */
export interface RequestCountStoreHarness {
  make(): Promise<RequestCountStoreUnderTest>;
  /** Needed only when the suite runs with `durable: true`. */
  reopen?(): Promise<RequestCountStoreUnderTest>;
}

/** The contract every `RequestCountStore` passes, on the host's memory or disk or in a Worker's store. */
export function requestCountStoreContract(
  name: string,
  harness: RequestCountStoreHarness,
  options: { durable: boolean },
): void {
  verifies("contracts.request-count-store", () => {
    describe(`RequestCountStore contract: ${name}`, () => {
      it("allows requests up to the limit and refuses the next one", async () => {
        const store = await harness.make();
        expect(await store.countRequest("2026-11-12", 2)).toEqual({ allowed: true, count: 1 });
        expect(await store.countRequest("2026-11-12", 2)).toEqual({ allowed: true, count: 2 });
        expect(await store.countRequest("2026-11-12", 2)).toEqual({ allowed: false, count: 2 });
        expect(await store.countRequest("2026-11-12", 2)).toEqual({ allowed: false, count: 2 });
      });

      it("never lets parallel requests past the limit", async () => {
        const store = await harness.make();
        const answers = await Promise.all(
          Array.from({ length: 20 }, () => store.countRequest("2026-11-12", 5)),
        );
        expect(answers.filter((answer) => answer.allowed)).toHaveLength(5);
      });

      it("starts a new day from zero", async () => {
        const store = await harness.make();
        await store.countRequest("2026-11-12", 1);
        expect((await store.countRequest("2026-11-12", 1)).allowed).toBe(false);
        expect(await store.countRequest("2026-11-13", 1)).toEqual({ allowed: true, count: 1 });
      });

      if (options.durable) {
        it("keeps the count over a restart", async () => {
          const store = await harness.make();
          await store.countRequest("2026-11-12", 1);
          if (harness.reopen === undefined) {
            throw new Error("A durable store's harness must say how to reopen it");
          }
          const reopened = await harness.reopen();
          expect((await reopened.countRequest("2026-11-12", 1)).allowed).toBe(false);
        });
      }
    });
  });
}
