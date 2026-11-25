import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { BrokerSecrets } from "./broker-secrets.ts";
import type { BrokerAnswer } from "./control-messages.ts";
import type { BrokerRequestKind } from "./control-pipe.ts";
import { SecretRedactor } from "./secret-redactor.ts";

/** A broker that holds `acme-key`, and records what it is asked. */
function acmeBroker() {
  const asked: string[] = [];
  const ask = async (kind: BrokerRequestKind, name: string): Promise<BrokerAnswer> => {
    asked.push(`${kind} ${name}`);
    if (kind === "origins_get") return { result: "origins", origins: ["https://api.acme.test"] };
    return { result: "value", value: name === "acme-key" ? "sk-acme-1" : null };
  };
  return { asked, ask };
}

verifies("agent-host.engine-role-arguments", () => {
  describe("BrokerSecrets", () => {
    it("asks the shell on every read, as it keeps no value", async () => {
      const broker = acmeBroker();
      const secrets = new BrokerSecrets(broker.ask, new SecretRedactor());
      expect(await secrets.get("acme-key")).toBe("sk-acme-1");
      expect(await secrets.get("acme-key")).toBe("sk-acme-1");
      expect(broker.asked).toEqual(["secret_get acme-key", "secret_get acme-key"]);
    });

    it("reads a key's origins through the shell", async () => {
      const broker = acmeBroker();
      const secrets = new BrokerSecrets(broker.ask, new SecretRedactor());
      expect(await secrets.allowedOrigins("acme-key")).toEqual(["https://api.acme.test"]);
      expect(broker.asked).toEqual(["origins_get acme-key"]);
    });

    it("refuses a name that breaks the rule without asking", async () => {
      const broker = acmeBroker();
      await expect(new BrokerSecrets(broker.ask, new SecretRedactor()).get("1bad")).rejects.toThrow(
        RangeError,
      );
      expect(broker.asked).toEqual([]);
    });
  });
});
