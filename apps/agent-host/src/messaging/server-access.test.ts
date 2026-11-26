import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type PairingDesktop, startPairingDesktop } from "./server-pairing.test-helper.ts";

let desktop: PairingDesktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

const id = "access-id-canary.access";
const secret = "access-secret-canary-91d3";
const access = { clientId: id, clientSecret: secret };

/** Pairs to the end with `with` as the Access service token. */
async function pairWith(on: PairingDesktop, given?: typeof access) {
  const answer = await on.engine.pair(on.server.address, "7KQ2 M9XF", "Acme laptop", given);
  if (answer.state !== "waiting") throw new Error(`The pairing didn't start: ${answer.state}`);
  on.pairingServer.allow();
  return on.engine.status(answer.pairingId);
}

const refusal = () => new Response("<html>Forbidden</html>", { status: 403 });

verifies("agent-host.server-engine-pairing", () => {
  describe("the Cloudflare Access service token", () => {
    it("goes on every call to the paired origin and to no other", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await pairWith(on, access)).toMatchObject({ state: "paired" });
      await on.studio.listSources();
      await on.engine.state();
      await on.engine.useThisComputer();
      const paths = on.pairingServer.access.map((call) => new URL(call.url).pathname);
      expect(paths).toEqual(
        expect.arrayContaining([
          "/api/hello",
          "/api/pair",
          "/api/pair/status",
          "/api/messaging/sources",
          "/api/devices/sign-out",
        ]),
      );
      for (const call of on.pairingServer.access) {
        expect(new URL(call.url).origin).toBe(on.server.address);
        expect({ id: call.id, secret: call.secret }).toEqual({ id, secret });
      }
    });

    it("is not sent when both fields are empty, nor is it kept", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await pairWith(on)).toMatchObject({ state: "paired" });
      await on.studio.listSources();
      expect(on.pairingServer.access.length).toBeGreaterThanOrEqual(3);
      for (const call of on.pairingServer.access)
        expect([call.id, call.secret]).toEqual([null, null]);
      const { key } = await on.setting.read(on.workspace);
      expect(await on.keychain.get(serverPairingSecretName(key))).toBe(on.server.token);
      expect(await on.engine.state()).not.toHaveProperty("accessSet");
    });

    it("is kept in the keychain with the device token, and in no answer, log, profile or workspace file", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairWith(on, access);
      const { key } = await on.setting.read(on.workspace);
      const kept = await on.keychain.get(serverPairingSecretName(key));
      expect(kept).toContain(on.server.token);
      expect(kept).toContain(secret);
      expect(await on.engine.state()).toMatchObject({ accessSet: true });
      await on.engine.setAccess({ clientId: id, clientSecret: `${secret}-rotated` });
      await on.engine.useThisComputer();
      const files = [
        ...(await on.filesIn(on.profile)).values(),
        ...(await on.filesIn(on.workspace)).values(),
      ];
      for (const canary of [id, secret, `${secret}-rotated`]) {
        expect(on.answers.join("\n")).not.toContain(canary);
        expect(on.logged.join("\n")).not.toContain(canary);
        expect(files.join("\n")).not.toContain(canary);
      }
    });

    it("can be replaced or cleared without pairing again, and the server's answer comes back", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairWith(on, access);
      const rotated = { clientId: "new-id", clientSecret: "new-secret" };
      expect(await on.engine.setAccess(rotated)).toEqual({ state: "saved", server: "online" });
      expect(on.pairingServer.access.at(-1)).toMatchObject({ id: "new-id", secret: "new-secret" });
      expect(await on.studio.listSources()).toHaveLength(1);
      expect(on.pairingServer.access.at(-1)).toMatchObject({ id: "new-id" });
      expect(await on.engine.setAccess(undefined)).toEqual({ state: "saved", server: "online" });
      expect(on.pairingServer.access.at(-1)).toMatchObject({ id: null, secret: null });
      const { key } = await on.setting.read(on.workspace);
      expect(await on.keychain.get(serverPairingSecretName(key))).toBe(on.server.token);
    });

    it("can't be set without a pairing, nor when the keychain won't keep it", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await on.engine.setAccess(access)).toEqual({ state: "not_paired" });
      await pairWith(on);
      on.pairingKeychain.failSet = true;
      expect(await on.engine.setAccess(access)).toEqual({ state: "key_not_saved" });
      expect(on.logged.join("")).toContain("KeychainError");
    });

    it("maps a redirect or the access check's 403 to access_refused, never to a generic failure", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const pair = () => on.engine.pair(on.server.address, "7KQ2 M9XF", "Acme laptop", access);
      on.pairingServer.hello = () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://team.cloudflareaccess.com/" },
        });
      expect(await pair()).toEqual({ state: "access_refused" });
      on.pairingServer.hello = refusal;
      expect(await pair()).toEqual({ state: "access_refused" });
      expect(on.pairingServer.calls("/api/pair")).toEqual([]);
      // The redirect was not followed: nothing was asked of another origin.
      expect(on.pairingServer.access.every((call) => call.url.startsWith(on.server.address))).toBe(
        true,
      );
    });

    it("shows a refusal on the state's check and while polling", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairWith(on, access);
      on.pairingServer.sources = refusal;
      expect(await on.engine.state()).toMatchObject({ server: { state: "access-refused" } });
      expect(await on.engine.setAccess(access)).toEqual({
        state: "saved",
        server: "access-refused",
      });
      const started = await (async () => {
        on.pairingServer.status = () => new Response(null, { status: 302 });
        return on.engine.pair(on.server.address, "7KQ2 M9XF", "Acme laptop", access);
      })();
      const pairingId = started.state === "waiting" ? started.pairingId : "";
      expect(await on.engine.status(pairingId)).toEqual({ state: "access_refused" });
    });

    it("needs both values or neither, and nothing a header can't carry", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const body = {
        workspace: on.workspace,
        address: on.server.address,
        code: "7KQ2 M9XF",
        deviceName: "A",
      };
      expect((await on.raw("pair", { ...body, accessClientId: id })).status).toBe(400);
      expect(
        (await on.raw("pair", { ...body, accessClientId: id, accessClientSecret: "a\nb" })).status,
      ).toBe(400);
      expect(
        (await on.raw("access", { workspace: on.workspace, accessClientSecret: secret })).status,
      ).toBe(400);
      expect(on.pairingServer.seen).toEqual([]);
    });
  });
});
