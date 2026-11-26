import { writeFile } from "node:fs/promises";
import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { messagingOnlyPrefixes } from "../messaging-only.ts";
import {
  expiresAt,
  type PairingDesktop,
  sessionEndsAt,
  startPairingDesktop,
} from "./server-pairing.test-helper.ts";
import { serverPairingRoutes } from "./server-pairing-routes.ts";

let desktop: PairingDesktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

const code = "7KQ2 M9XF";
const deviceName = "Acme laptop";

/** Starts a pairing with the fake server and gives its ID. */
async function started(on: PairingDesktop): Promise<string> {
  const answer = await on.engine.pair(on.server.address, code, deviceName);
  if (answer.state !== "waiting") throw new Error(`The pairing didn't start: ${answer.state}`);
  return answer.pairingId;
}

/** Starts a pairing as `name` that the server's owner allowed: its next status pairs it. */
async function pairedAs(on: PairingDesktop, name: string): Promise<string> {
  const answer = await on.engine.pair(on.server.address, code, name);
  if (answer.state !== "waiting") throw new Error(`The pairing didn't start: ${answer.state}`);
  on.pairingServer.allow();
  return answer.pairingId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

verifies("agent-host.server-engine-pairing", () => {
  describe("pairing", () => {
    it("pairs: the token goes to the keychain, the setting to Server, the hub to the server", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const answer = await on.engine.pair(on.server.address, code, deviceName);
      expect(answer).toMatchObject({ state: "waiting", checkCode: "4F72KQ", expiresAt });
      expect(on.pairingServer.calls("/api/hello")).toHaveLength(1);
      expect(on.pairingServer.calls("/api/pair")[0]?.body).toBe(
        JSON.stringify({ code, deviceName }),
      );
      const pairingId = answer.state === "waiting" ? answer.pairingId : "";
      expect(await on.engine.status(pairingId)).toEqual({ state: "waiting", expiresAt });

      on.pairingServer.allow();
      expect(await on.engine.status(pairingId)).toEqual({ state: "paired", sessionEndsAt });

      const { key } = await on.setting.read(on.workspace);
      expect(await on.keychain.get(serverPairingSecretName(key))).toBe(on.server.token);
      expect(await on.engine.state()).toEqual({
        engine: "server",
        address: on.server.address,
        pairing: "kept",
        computerName: "acme-mbp",
        deviceName,
        // Joining the server called it at once.
        reach: { state: "online", asOf: "2026-11-24T14:00:00.000Z" },
      });
      expect((await on.studio.listSources()).map((source) => source.id)).toEqual([
        "halonic-server:acme",
      ]);
      // The pending ID collects the token, so it never reaches the page either.
      expect(on.answers.join("\n")).not.toContain("a".repeat(64));
      expect(await on.engine.status(pairingId)).toEqual({ state: "lost" });
    });

    it("maps every ending the server names, and 404 to lost", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const endings: [Response, string][] = [
        [json({ state: "expired" }), "expired"],
        [json({ state: "refused" }), "refused"],
        [json({ state: "cancelled" }), "cancelled"],
        [json({ state: "taken-over" }), "taken-over"],
        [json({ code: "not_found" }, 404), "lost"],
      ];
      for (const [response, state] of endings) {
        on.pairingServer.status = () => response;
        const pairingId = await started(on);
        expect(await on.engine.status(pairingId)).toEqual({ state });
        expect(await on.engine.status(pairingId)).toEqual({ state: "lost" });
      }
      expect(await on.engine.state()).toEqual({
        engine: "this-computer",
        computerName: "acme-mbp",
      });
    });

    it("answers code_refused for 401, and too_many with minutes when the server gave them", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const pair = () => on.engine.pair(on.server.address, code, deviceName);
      on.pairingServer.pair = () => json({ code: "pairing_code_refused" }, 401);
      expect(await pair()).toEqual({ state: "code_refused" });
      on.pairingServer.pair = () =>
        new Response("{}", { status: 429, headers: { "retry-after": "150" } });
      expect(await pair()).toEqual({ state: "too_many", minutes: 3 });
      on.pairingServer.pair = () => new Response("{}", { status: 429 });
      expect(await pair()).toEqual({ state: "too_many" });
    });

    it("checks the address first: not https, not a Halonic server, or not answering", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const pair = (address: string) => on.engine.pair(address, code, deviceName);
      expect(await pair("http://halonic.acme.test")).toEqual({ state: "address_not_allowed" });
      on.pairingServer.hello = () => json({ product: "something-else" });
      expect(await pair(on.server.address)).toEqual({ state: "not_halonic" });
      on.pairingServer.hello = () =>
        new Response(null, { status: 302, headers: { location: "/" } });
      expect(await pair(on.server.address)).toEqual({ state: "not_halonic" });
      on.pairingServer.unreachable = true;
      expect(await pair(on.server.address)).toEqual({ state: "unreachable" });
      expect(on.pairingServer.calls("/api/pair")).toEqual([]);
    });

    it("keeps waiting while the server can't be reached", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const pairingId = await started(on);
      on.pairingServer.unreachable = true;
      expect(await on.engine.status(pairingId)).toEqual({ state: "unreachable" });
      on.pairingServer.unreachable = false;
      expect(await on.engine.status(pairingId)).toEqual({ state: "waiting", expiresAt });
    });

    it("cancels on the server, and says when the server couldn't be told", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await on.engine.cancel(await started(on))).toBe(true);
      expect(on.pairingServer.calls("/api/pair/cancel")[0]?.body).toBe(
        JSON.stringify({ pendingId: "a".repeat(64) }),
      );
      const second = await started(on);
      on.pairingServer.unreachable = true;
      expect(await on.engine.cancel(second)).toBe(false);
      expect(await on.engine.status(second)).toEqual({ state: "lost" });
    });
  });

  describe("the state answer", () => {
    it("keeps the name it paired as with the setting, and leaves out one that isn't a name", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const pairingId = await pairedAs(on, "Work laptop");
      expect(await on.engine.status(pairingId)).toEqual({ state: "paired", sessionEndsAt });
      const files = [...(await on.filesIn(on.profile)).entries()];
      const [file, text] = files.find(([name]) => name.endsWith("messaging-engine.json")) ?? [];
      expect(JSON.parse(text ?? "{}")).toMatchObject({ deviceName: "Work laptop" });
      expect(await on.engine.state()).toMatchObject({ deviceName: "Work laptop" });

      await writeFile(
        file ?? "",
        JSON.stringify({ ...JSON.parse(text ?? "{}"), deviceName: "Work\u0007laptop" }),
      );
      const state = await on.engine.state();
      expect(state).toMatchObject({ engine: "server", pairing: "kept" });
      expect(state).not.toHaveProperty("deviceName");
      expect(on.logged.join("")).toContain("device name is left out");
      expect(on.logged.join("")).not.toContain("Work");
    });

    it("says Offline as of the failed call, keeps it for a 401, and starts over on pairing again", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await on.engine.status(await pairedAs(on, deviceName));
      const online = { state: "online", asOf: "2026-11-24T14:00:00.000Z" };
      expect(await on.engine.state()).toMatchObject({ reach: online });

      const timedOut = new DOMException("The call timed out.", "TimeoutError");
      on.server.fault = () => Promise.reject(timedOut);
      await on.wait(60_000);
      await on.studio.listSources();
      const offline = { state: "offline", asOf: "2026-11-24T14:01:00.000Z" };
      expect(await on.engine.state()).toMatchObject({ reach: offline });

      on.server.fault = () => Promise.resolve(json({ code: "signed-out" }, 401));
      await on.studio.listSources();
      expect(await on.engine.state()).toMatchObject({ reach: offline });

      // The new pairing's calls are held: until one ends, the old pairing's Offline isn't its.
      let release = (_answer: Response) => {};
      const held = new Promise<Response>((resolve) => {
        release = resolve;
      });
      on.server.fault = () => held;
      await on.engine.status(await pairedAs(on, deviceName));
      expect(await on.engine.state()).not.toHaveProperty("reach");
      release(json({ code: "signed-out" }, 401));
    });
  });

  describe("the routes", () => {
    it("refuses a page of another site with 403 before it calls anything", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const body = { workspace: on.workspace, address: on.server.address, code, deviceName };
      const answer = await on.raw("pair", body, "cross-site");
      expect(answer.status).toBe(403);
      expect(answer.text).toContain("secret_from_other_site");
      expect(on.pairingServer.seen).toEqual([]);
    });

    it("answers 409 keychain_needed without a keychain, and 404 for another folder", async () => {
      desktop = await startPairingDesktop({ keychain: false });
      const on = desktop;
      await expect(on.engine.state()).rejects.toMatchObject({
        status: 409,
        kind: "keychain_needed",
      });
      await desktop.close();
      desktop = await startPairingDesktop();
      const answer = await desktop.raw("state", { workspace: "/not/a/workspace" });
      expect(answer.status).toBe(404);
    });

    it("lives under a prefix the messaging-only host serves", () => {
      const routes = serverPairingRoutes({
        messaging: undefined as never,
        pairing: undefined,
        log: () => {},
      });
      expect(routes).toHaveLength(5);
      for (const route of routes) {
        expect(messagingOnlyPrefixes.some((prefix) => route.path.startsWith(prefix))).toBe(true);
      }
    });
  });
});
