import type { IdGenerator } from "@halonicjs/ports";
import { describe, expect, it } from "vitest";

/** Creates the generator under test. */
export type MakeIdGenerator = () => Promise<IdGenerator>;

/** The contract every {@link IdGenerator} adapter passes. */
export function idGeneratorContract(name: string, make: MakeIdGenerator): void {
  describe(`IdGenerator contract (contracts.id-generator): ${name}`, () => {
    it("starts every id with its prefix", async () => {
      const ids = await make();
      for (const prefix of ["run", "event", "a", "run_"]) {
        expect(ids.next(prefix).startsWith(prefix), prefix).toBe(true);
      }
    });

    it("never gives the same id twice, also across prefixes that overlap", async () => {
      const ids = await make();
      const seen = new Set<string>();
      for (let index = 0; index < 1000; index += 1) {
        for (const prefix of ["a", "a1", "a_1", "run"]) {
          seen.add(ids.next(prefix));
        }
      }
      expect(seen.size).toBe(4000);
    });
  });
}
