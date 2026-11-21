import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { callBody, handOver, post, type Setup, startRoutes } from "./plugin-routes.test-helper.ts";

// A fake value only these tests use, so its absence from answers and logs means something.
const fakeValue = "fake-acme-key-for-tests-only";

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

async function started(): Promise<Setup> {
  setup = await startRoutes();
  return setup;
}

async function errorOf(response: Response): Promise<string> {
  return ((await response.json()) as { error: { kind: string } }).error.kind;
}

/** What the backend of `acme` reads for its key. */
async function acmeKey(): Promise<string | null> {
  return (await setup?.secretValues.secrets.get("plugin__acme__acme-key")) ?? null;
}

verifies("agent-host.plugin-secrets", () => {
  describe("the hand-over route", () => {
    it("keeps a trusted plugin's declared secret under the plugin's own name", async () => {
      const { url } = await started();
      const kept = await handOver(url, "acme", { "acme-key": fakeValue });
      expect(kept.status).toBe(200);
      expect(await kept.json()).toEqual({ kept: 1 });
      expect(await acmeKey()).toBe(fakeValue);
    });

    it("takes a request from the page itself", async () => {
      const { url } = await started();
      expect((await handOver(url, "acme", { "acme-key": fakeValue }, "same-origin")).status).toBe(
        200,
      );
    });

    it("forgets the plugin's secrets when Studio hands over none", async () => {
      const { url } = await started();
      await handOver(url, "acme", { "acme-key": fakeValue });
      expect(await (await handOver(url, "acme", {})).json()).toEqual({ kept: 0 });
      expect(await acmeKey()).toBeNull();
    });

    it("refuses a page of another site before it reads the body", async () => {
      const { url } = await started();
      const refused = await handOver(url, "acme", { "acme-key": fakeValue }, "cross-site");
      expect(refused.status).toBe(403);
      expect(await errorOf(refused)).toBe("secret_from_other_site");
      expect(await acmeKey()).toBeNull();
    });

    it("refuses a name the plugin doesn't declare and keeps the values held before", async () => {
      const { url } = await started();
      await handOver(url, "acme", { "acme-key": fakeValue });
      const refused = await handOver(url, "acme", { "acme-key": "new", "other-key": "x" });
      expect(refused.status).toBe(400);
      expect(await errorOf(refused)).toBe("secret_not_declared");
      expect(await acmeKey()).toBe(fakeValue);
    });

    it("refuses an empty value, too many secrets or a value that is too long, with no detail", async () => {
      const { url } = await started();
      const tooMany = Object.fromEntries(
        Array.from({ length: 33 }, (_, index) => [`key-${index}`, fakeValue]),
      );
      for (const secrets of [
        { "acme-key": "" },
        tooMany,
        { "acme-key": "x".repeat(16_385) },
        { [`k${"y".repeat(64)}`]: fakeValue },
      ]) {
        const refused = await handOver(url, "acme", secrets);
        expect(refused.status).toBe(400);
        const text = await refused.text();
        expect(text).toContain("body_invalid");
        expect(text).not.toContain(fakeValue);
      }
      expect(await acmeKey()).toBeNull();
    });

    it("refuses a plugin the trust doesn't cover and drops what it held", async () => {
      const { url, backends } = await started();
      await handOver(url, "acme", { "acme-key": fakeValue });
      backends.trusted.delete("acme");
      const refused = await handOver(url, "acme", { "acme-key": fakeValue });
      expect(refused.status).toBe(403);
      expect(await errorOf(refused)).toBe("plugin_not_trusted");
      expect(await acmeKey()).toBeNull();
    });

    it("drops what it held when a call finds the plugin no longer trusted", async () => {
      const { url, backends } = await started();
      await handOver(url, "acme", { "acme-key": fakeValue });
      backends.trusted.delete("acme");
      expect((await post(url, callBody())).status).toBe(403);
      expect(await acmeKey()).toBeNull();
    });

    it("drops every value when the host stops, and keeps none after", async () => {
      const { url, table } = await started();
      await handOver(url, "acme", { "acme-key": fakeValue });
      await table.closeAll();
      expect(await acmeKey()).toBeNull();
      const refused = await handOver(url, "acme", { "acme-key": fakeValue });
      expect(refused.status).toBe(503);
      expect(await acmeKey()).toBeNull();
    });

    it("keeps nothing from a hand-over still in flight when the host stops", async () => {
      const { url, backends, table } = await started();
      backends.whileCheckingSecrets = () => table.closeAll();
      const refused = await handOver(url, "acme", { "acme-key": fakeValue });
      expect(refused.status).toBe(503);
      expect(await errorOf(refused)).toBe("host_stopping");
      expect(await acmeKey()).toBeNull();
    });

    it("never puts a value in an answer or the log", async () => {
      const { url, backends, logged } = await started();
      const answers = [
        await handOver(url, "acme", { "acme-key": fakeValue }),
        await handOver(url, "acme", { "other-key": fakeValue }),
        await handOver(url, "acme", { "acme-key": fakeValue }, "cross-site"),
      ];
      backends.trusted.delete("acme");
      answers.push(await handOver(url, "acme", { "acme-key": fakeValue }));
      for (const answer of answers) expect(await answer.text()).not.toContain(fakeValue);
      expect(logged.join("")).not.toContain(fakeValue);
    });
  });
});
