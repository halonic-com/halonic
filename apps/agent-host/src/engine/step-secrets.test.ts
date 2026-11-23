import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { BrokerAnswer, RefusalReason } from "./control-messages.ts";
import type { BrokerRequestKind } from "./control-pipe.ts";
import { StepSecrets, StepSecretsError } from "./step-secrets.ts";

/** A broker that answers from `answers` by request kind and name, and records what was asked. */
function fakeBroker(answers: Record<string, BrokerAnswer>) {
  const asked: string[] = [];
  const ask = async (kind: BrokerRequestKind, name: string): Promise<BrokerAnswer> => {
    asked.push(`${kind} ${name}`);
    return answers[`${kind} ${name}`] ?? { result: "refused", reason: "failed" };
  };
  return { ask, asked };
}

const refused = (reason: RefusalReason): BrokerAnswer => ({ result: "refused", reason });

verifies("agent-host.engine-step-secrets", () => {
  describe("secrets", () => {
    it("reads a value from the broker once per step and redacts it", async () => {
      const broker = fakeBroker({
        "secret_get acme-key": { result: "value", value: "sk-acme-1" },
      });
      const secrets = new StepSecrets(broker.ask);
      expect(await secrets.get("acme-key")).toBe("sk-acme-1");
      expect(await secrets.get("ACME_KEY")).toBe("sk-acme-1");
      expect(broker.asked).toEqual(["secret_get acme-key"]);
      expect(secrets.redact("sent sk-acme-1 twice: sk-acme-1")).toBe(
        "sent [redacted] twice: [redacted]",
      );
    });

    it("forgets values when the step ends and refuses later reads", async () => {
      const broker = fakeBroker({
        "secret_get acme-key": { result: "value", value: "sk-acme-1" },
      });
      const secrets = new StepSecrets(broker.ask);
      await secrets.get("acme-key");
      secrets.close();
      await expect(secrets.get("acme-key")).rejects.toBeInstanceOf(StepSecretsError);
      await expect(secrets.allowedOrigins("acme-key")).rejects.toBeInstanceOf(StepSecretsError);
      expect(broker.asked).toHaveLength(1);
      expect(secrets.redact("sk-acme-1")).toBe("sk-acme-1");
    });

    it("keeps nothing when the step ends while the shell answers", async () => {
      let answer: (value: BrokerAnswer) => void = () => {};
      const secrets = new StepSecrets(
        () => new Promise<BrokerAnswer>((resolve) => (answer = resolve)),
      );
      const read = secrets.get("acme-key");
      secrets.close();
      answer({ result: "value", value: "sk-acme-1" });
      await expect(read).rejects.toBeInstanceOf(StepSecretsError);
      expect(secrets.redact("sk-acme-1")).toBe("sk-acme-1");
    });

    it("refuses a name that breaks the rule without asking", async () => {
      const broker = fakeBroker({});
      const secrets = new StepSecrets(broker.ask);
      await expect(secrets.get("1bad")).rejects.toBeInstanceOf(RangeError);
      await expect(secrets.allowedOrigins("1bad")).rejects.toBeInstanceOf(RangeError);
      expect(broker.asked).toEqual([]);
    });

    it.each(["invalid_name", "reserved_name"] as const)(
      "treats %s as not found",
      async (reason) => {
        const secrets = new StepSecrets(
          fakeBroker({ "secret_get token_key": refused(reason) }).ask,
        );
        expect(await secrets.get("token_key")).toBeNull();
      },
    );

    it.each([
      ["untrusted", "untrusted"],
      ["busy", "unavailable"],
      ["unavailable", "unavailable"],
      ["denied", "unavailable"],
      ["unreadable", "failed"],
      ["failed", "failed"],
    ] as const)("turns %s into a %s error", async (reason, expected) => {
      const secrets = new StepSecrets(fakeBroker({ "secret_get acme-key": refused(reason) }).ask);
      const error = await secrets.get("acme-key").catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(StepSecretsError);
      expect((error as StepSecretsError).reason).toBe(expected);
    });

    it("offers no way to write a secret or an origin", () => {
      const secrets = new StepSecrets(fakeBroker({}).ask) as unknown as Record<string, unknown>;
      for (const name of ["set", "remove", "names", "setAllowedOrigins"]) {
        expect(secrets[name]).toBeUndefined();
      }
    });
  });

  describe("key origins", () => {
    it("reads a key's origins, or none recorded", async () => {
      const secrets = new StepSecrets(
        fakeBroker({
          "origins_get acme-key": { result: "origins", origins: ["https://api.acme.test"] },
          "origins_get old-key": { result: "origins", origins: null },
        }).ask,
      );
      expect(await secrets.allowedOrigins("acme-key")).toEqual(["https://api.acme.test"]);
      expect(await secrets.allowedOrigins("old-key")).toBeUndefined();
      expect(secrets.store).toBe("keychain");
    });

    it.each([
      ["empty", []],
      ["too long", Array.from({ length: 9 }, (_, index) => `https://${index}.acme.test`)],
    ])("fails on an %s list", async (_what, origins) => {
      const secrets = new StepSecrets(
        fakeBroker({ "origins_get acme-key": { result: "origins", origins } }).ask,
      );
      await expect(secrets.allowedOrigins("acme-key")).rejects.toBeInstanceOf(StepSecretsError);
    });
  });
});
