import type {
  InstructionPin,
  InstructionTrustKey,
  InstructionTrustRecord,
  InstructionTrustStore,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { InstructionTrustService } from "./instruction-trust-service.ts";

const key: InstructionTrustKey = { location: "/workspaces/acme", agent: "coder" };
const digest = (character: string) => `sha256:${character.repeat(64)}`;
const pin: InstructionPin = { digest: digest("1"), files: { "AGENTS.md": digest("a") } };
const clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };

/** A store that holds what it is given, or throws what it is told to. */
class FakeStore implements InstructionTrustStore {
  record: InstructionTrustRecord | null = null;
  getError: Error | null = null;
  removed: InstructionTrustKey[] = [];

  async get(): Promise<InstructionTrustRecord | null> {
    if (this.getError !== null) throw this.getError;
    return this.record;
  }
  async save(record: InstructionTrustRecord): Promise<void> {
    this.record = record;
  }
  async remove(removed: InstructionTrustKey): Promise<void> {
    this.removed.push(removed);
    this.record = null;
  }
}

function serviceOn(store: FakeStore) {
  return new InstructionTrustService({ store, clock });
}

verifies("app.instruction-trust-service", () => {
  describe("InstructionTrustService", () => {
    it("asks for an agent nobody has trusted, naming every file as added", async () => {
      const check = await serviceOn(new FakeStore()).check(key, pin);
      expect(check).toEqual({
        kind: "ask",
        changes: { added: ["AGENTS.md"], removed: [], changed: [] },
      });
    });

    it("trusts the pin a person trusted, and asks again once a file changes", async () => {
      const service = serviceOn(new FakeStore());
      await service.trust(key, pin);
      expect(await service.check(key, pin)).toEqual({ kind: "trusted" });

      const edited = { digest: digest("2"), files: { "AGENTS.md": digest("b") } };
      expect(await service.check(key, edited)).toEqual({
        kind: "ask",
        changes: { added: [], removed: [], changed: ["AGENTS.md"] },
      });
    });

    it("saves the pin with the time of the yes", async () => {
      const store = new FakeStore();
      await serviceOn(store).trust(key, pin);
      expect(store.record).toEqual({ ...key, pin, grantedAt: "2026-11-15T10:00:00.000Z" });
    });

    it("asks, saying why, when the trusted record can't be read", async () => {
      const store = new FakeStore();
      store.getError = new Error("The trusted instructions can't be read.");
      expect(await serviceOn(store).check(key, pin)).toEqual({
        kind: "ask",
        changes: { added: ["AGENTS.md"], removed: [], changed: [] },
        unreadable: "The trusted instructions can't be read.",
      });
    });

    it("never trusts a record that isn't the agent's, even one the store gave back", async () => {
      const store = new FakeStore();
      store.record = { ...key, agent: "reviewer", pin, grantedAt: "2026-11-15T10:00:00.000Z" };
      const check = await serviceOn(store).check(key, pin);
      expect(check.kind).toBe("ask");
      expect(check.kind === "ask" && check.unreadable).toBe(
        'The trusted instructions for the agent "coder" aren\'t valid.',
      );
    });

    it("refuses to trust a pin that would never read back", async () => {
      const store = new FakeStore();
      const damaged = { digest: "not-a-digest", files: { "AGENTS.md": digest("a") } };
      await expect(serviceOn(store).trust(key, damaged)).rejects.toThrow('"coder"');
      expect(store.record).toBeNull();
    });

    it("forgets what was trusted, so the next run asks", async () => {
      const store = new FakeStore();
      const service = serviceOn(store);
      await service.trust(key, pin);
      await service.revoke(key);
      expect(store.removed).toEqual([key]);
      expect((await service.check(key, pin)).kind).toBe("ask");
    });
  });
});
