import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type PairingDesktop, startPairingDesktop } from "./server-pairing.test-helper.ts";

let desktop: PairingDesktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** The workspace's keychain entry name. */
async function entryOf(on: PairingDesktop): Promise<string> {
  return serverPairingSecretName((await on.setting.read(on.workspace)).key);
}

/** Pairs to the end: started, allowed, polled once. */
async function pairedAnswer(on: PairingDesktop) {
  const answer = await on.engine.pair(on.server.address, "7KQ2 M9XF", "Acme laptop");
  if (answer.state !== "waiting") throw new Error(`The pairing didn't start: ${answer.state}`);
  on.pairingServer.allow();
  return on.engine.status(answer.pairingId);
}

/** The canary is in no answer the page got and no line the host logged. */
function expectNoCanary(on: PairingDesktop): void {
  // The host's log has one level: every line it writes, the detailed ones included, is here.
  expect(on.answers.join("\n")).not.toContain(on.server.token);
  expect(on.logged.join("\n")).not.toContain(on.server.token);
}

verifies("agent-host.server-engine-pairing", () => {
  describe("the token is in no answer and no log line", () => {
    it("on the success path, through every route", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await pairedAnswer(on)).toMatchObject({ state: "paired" });
      await on.engine.state();
      await on.engine.useThisComputer();
      expect(on.answers.length).toBeGreaterThanOrEqual(4);
      expectNoCanary(on);
    });

    it("when the keychain's write fails: it signs out and keeps no setting", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      on.pairingKeychain.failSet = true;
      expect(await pairedAnswer(on)).toEqual({ state: "key_not_saved", signedOut: true });
      const signOuts = on.pairingServer.calls("/api/devices/sign-out");
      expect(signOuts.map((call) => call.authorization)).toEqual([`Bearer ${on.server.token}`]);
      expect(await on.engine.state()).toEqual({ engine: "this-computer" });
      expect(on.logged.join("")).toContain("KeychainError");
      expectNoCanary(on);
    });

    it("when the keychain gives back something else: nothing is kept", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      on.pairingKeychain.garbleGet = true;
      expect(await pairedAnswer(on)).toEqual({ state: "key_not_saved", signedOut: true });
      on.pairingKeychain.garbleGet = false;
      expect(await on.keychain.get(await entryOf(on))).toBeNull();
      expect(await on.engine.state()).toEqual({ engine: "this-computer" });
      expectNoCanary(on);
    });

    it("when the state's check of the server fails or is signed out, and repeats the token", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      expect(await pairedAnswer(on)).toMatchObject({ state: "paired" });
      const echo = (status: number) => () => new Response(`no ${on.server.token}`, { status });
      on.pairingServer.sources = echo(500);
      expect(await on.engine.state()).toMatchObject({ server: { state: "offline" } });
      on.pairingServer.sources = echo(401);
      expect(await on.engine.state()).toMatchObject({ server: { state: "signed-out" } });
      on.pairingServer.unreachable = true;
      expect(await on.engine.state()).toMatchObject({ server: { state: "offline" } });
      // The token went in the check's header only, never in a body or the address.
      const checks = on.pairingServer.calls("/api/messaging/sources");
      expect(checks).toHaveLength(3);
      for (const check of checks) {
        expect(check).toEqual({
          path: "/api/messaging/sources",
          body: "",
          authorization: `Bearer ${on.server.token}`,
        });
      }
      expectNoCanary(on);
    });

    it("when the server's 5xx repeats the token, on the poll and on the sign-out", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      const echo = () => new Response(`failed for ${on.server.token}`, { status: 500 });
      const answer = await on.engine.pair(on.server.address, "7KQ2 M9XF", "Acme laptop");
      const pairingId = answer.state === "waiting" ? answer.pairingId : "";
      on.pairingServer.status = echo;
      expect(await on.engine.status(pairingId)).toEqual({ state: "unreachable" });
      on.pairingServer.allow();
      on.pairingServer.signOut = echo;
      on.pairingKeychain.failSet = true;
      expect(await on.engine.status(pairingId)).toEqual({
        state: "key_not_saved",
        signedOut: false,
      });
      expectNoCanary(on);
    });
  });

  describe("switching back to This computer", () => {
    it("signs out, deletes the token, the cache and the setting", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairedAnswer(on);
      await on.studio.listSources();
      expect(await on.engine.useThisComputer()).toEqual({ stillValid: false });
      expect(on.pairingServer.calls("/api/devices/sign-out")).toHaveLength(1);
      expect(await on.keychain.get(await entryOf(on))).toBeNull();
      expect(await on.engine.state()).toEqual({ engine: "this-computer" });
      expect((await on.messaging.of(on.workspace))?.engine).toEqual({ kind: "this-computer" });
      const cached = [...(await on.filesIn(on.profile)).keys()];
      expect(cached.filter((path) => path.includes("agent-messaging-cache"))).toEqual([]);
    });

    it("with the server unreachable: token and setting gone, and stillValid", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairedAnswer(on);
      on.pairingServer.unreachable = true;
      expect(await on.engine.useThisComputer()).toEqual({ stillValid: true });
      expect(await on.keychain.get(await entryOf(on))).toBeNull();
      expect(await on.engine.state()).toEqual({ engine: "this-computer" });
    });

    it("when the keychain can't read or delete the token: the setting goes anyway", async () => {
      desktop = await startPairingDesktop();
      const on = desktop;
      await pairedAnswer(on);
      on.pairingKeychain.failGet = true;
      on.pairingKeychain.failRemove = true;
      expect(await on.engine.useThisComputer()).toEqual({
        stillValid: true,
        keychainEntryKept: true,
      });
      expect(on.pairingServer.calls("/api/devices/sign-out")).toEqual([]);
      on.pairingKeychain.failGet = false;
      expect(await on.engine.state()).toEqual({ engine: "this-computer" });
      expectNoCanary(on);
    });
  });
});
