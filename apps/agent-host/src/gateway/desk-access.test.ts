import { randomBytes } from "node:crypto";
import type { PairingAttempt, PairingPhone, PairingStart } from "@halonicjs/adapter-remote-gateway";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { HostKey } from "../remote/host-key.ts";
import { MemoryFile } from "../remote/memory-file.test-helper.ts";
import { PairedPhones } from "../remote/paired-phones.ts";
import { PairingDesk } from "../remote/pairing-desk.ts";
import type { DeskEndReason, OpenPairing, PairingWatcher } from "../remote/pairing-types.ts";
import { ManualTime, settled } from "../remote/remote-time.test-helper.ts";
import { deskAccess } from "./desk-access.ts";

const minute = 60_000;
const pixel: PairingPhone = {
  publicKey: new Uint8Array(32).fill(7),
  name: "Pixel 8",
  platform: "android",
  checkCode: "4821",
};

const hostKey: HostKey = {
  publicKey: new Uint8Array(32).fill(1),
  privateKey: () => new Uint8Array(32).fill(2),
};

/** The gateway's access on a real desk and store, with a dialog that records what it heard. */
async function hostOnManualTime() {
  const time = new ManualTime();
  const file = new MemoryFile();
  const logged: string[] = [];
  const log = (text: string) => logged.push(text);
  const desk = new PairingDesk({
    time,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
  });
  const phones = await PairedPhones.open({ file, time, log });
  const access = deskAccess({ desk, phones, hostKey, hostName: "Studio laptop", log });
  const checks: string[] = [];
  const ended: DeskEndReason[] = [];
  const watcher: PairingWatcher = {
    check: ({ checkCode, phone }) => checks.push(`${checkCode} ${phone.name}`),
    paired: async (phone) => {
      await phones.add(phone);
    },
    ended: (reason) => ended.push(reason),
  };
  const open = (): OpenPairing => {
    const pairing = desk.open(watcher);
    if (pairing === undefined) throw new Error("a pairing is already open");
    return pairing;
  };
  const attempt = (): PairingAttempt => openStart(access.pairing.begin()).attempt;
  return { time, file, logged, desk, phones, access, checks, ended, open, attempt };
}

function openStart(start: PairingStart): Extract<PairingStart, { kind: "open" }> {
  if (start.kind !== "open") throw new Error(`refused: ${start.refusal.reason}`);
  return start;
}

const aSignal = () => new AbortController().signal;

verifies("agent-host.remote-gateway-access", () => {
  describe("begin", () => {
    it("sends the desk's refusal as it is while no pairing is open", async () => {
      const { access } = await hostOnManualTime();
      expect(access.pairing.begin()).toEqual({
        kind: "refused",
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
    });

    it("gives the open pairing's code for the handshake", async () => {
      const { access, open } = await hostOnManualTime();
      const pairing = open();
      expect(openStart(access.pairing.begin()).code).toBe(pairing.code);
    });
  });

  describe("tries", () => {
    it("counts nothing for a message 1 that couldn't be read", async () => {
      const { open, attempt } = await hostOnManualTime();
      open();
      attempt().drop();
      expect(attempt().wrongTry()).toEqual({ reason: "wrong-code", triesLeft: 4 });
    });

    it("counts a handshake that closed after message 2 once, as the gateway reports it", async () => {
      const { open, attempt } = await hostOnManualTime();
      open();
      const closed = attempt();
      // The gateway reports a session that closes in the handshake as one wrong try, and nothing else.
      expect(closed.wrongTry()).toEqual({ reason: "wrong-code", triesLeft: 4 });
      expect(attempt().wrongTry()).toEqual({ reason: "wrong-code", triesLeft: 3 });
    });

    it("ends the code on its fifth wrong try", async () => {
      const { open, attempt, ended, access } = await hostOnManualTime();
      open();
      for (let tries = 0; tries < 4; tries += 1) attempt().wrongTry();
      expect(attempt().wrongTry()).toEqual({ reason: "code-ended", triesLeft: 0 });
      expect(ended).toEqual(["too-many-tries"]);
      expect(access.pairing.begin()).toEqual({
        kind: "refused",
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
    });
  });

  describe("decrypted", () => {
    it("shows the check code with the phone's name, and pairs it on Allow", async () => {
      const { open, attempt, checks, access } = await hostOnManualTime();
      const pairing = open();
      const answer = attempt().decrypted(pixel, aSignal());
      expect(checks).toEqual(["4821 Pixel 8"]);
      await pairing.allow();
      expect(await answer).toEqual({ kind: "allowed" });
      expect(access.phones.isPaired(pixel.publicKey)).toBe(true);
    });

    it("tells the phone denied on Don't allow, and timed-out when Allow doesn't come", async () => {
      const denied = await hostOnManualTime();
      const pairing = denied.open();
      const answer = denied.attempt().decrypted(pixel, aSignal());
      pairing.deny();
      expect(await answer).toEqual({ kind: "denied" });

      const late = await hostOnManualTime();
      late.open();
      const lateAnswer = late.attempt().decrypted(pixel, aSignal());
      await late.time.advance(2 * minute);
      expect(await lateAnswer).toEqual({ kind: "timed-out" });
    });

    it("refuses a second phone whose message 3 decrypted after the first used the code", async () => {
      const { open, attempt } = await hostOnManualTime();
      open();
      const first = attempt();
      const second = attempt();
      void first.decrypted(pixel, aSignal());
      expect(
        await second.decrypted({ ...pixel, publicKey: new Uint8Array(32).fill(9) }, aSignal()),
      ).toEqual({
        kind: "refused",
        refusal: { reason: "code-used", triesLeft: 0 },
      });
    });

    it("ends the pairing as the phone leaving when its signal aborts while Allow is awaited", async () => {
      const { open, attempt, ended } = await hostOnManualTime();
      const pairing = open();
      const phoneLeaves = new AbortController();
      const answer = attempt().decrypted(pixel, phoneLeaves.signal);
      phoneLeaves.abort();
      expect(await answer).toEqual({ kind: "timed-out" });
      expect(ended).toEqual(["phone-left"]);
      await expect(pairing.allow()).rejects.toThrow();
    });

    it("ends the pairing at once for a phone that left before its message 3 was handled", async () => {
      const { open, attempt, ended } = await hostOnManualTime();
      open();
      const gone = new AbortController();
      gone.abort();
      expect(await attempt().decrypted(pixel, gone.signal)).toEqual({ kind: "timed-out" });
      expect(ended).toEqual(["phone-left"]);
    });

    it("keeps a phone that leaves after Allow was pressed", async () => {
      const { open, attempt, access, ended } = await hostOnManualTime();
      const pairing = open();
      const phoneLeaves = new AbortController();
      const answer = attempt().decrypted(pixel, phoneLeaves.signal);
      const allowed = pairing.allow();
      phoneLeaves.abort();
      await allowed;
      expect(await answer).toEqual({ kind: "allowed" });
      expect(access.phones.isPaired(pixel.publicKey)).toBe(true);
      expect(ended).toEqual([]);
    });
  });

  describe("phones", () => {
    it("gives the host's key and the dialog's name", async () => {
      const { access } = await hostOnManualTime();
      expect(access.phones.hostPrivateKey()).toEqual(new Uint8Array(32).fill(2));
      expect(access.phones.hostName()).toBe("Studio laptop");
    });

    it("counts a paired phone connected until its session ends", async () => {
      const { access, phones } = await hostOnManualTime();
      const kept = await phones.add(pixel);
      const session = access.phones.connected(pixel.publicKey, () => {});
      expect(phones.find(pixel.publicKey)?.connected).toBe(true);
      session.end();
      await settled();
      expect(phones.find(pixel.publicKey)?.connected).toBe(false);
      expect(phones.find(pixel.publicKey)?.id).toBe(kept.id);
    });

    it("cuts a connected phone's session when it is revoked", async () => {
      const { access, phones } = await hostOnManualTime();
      const kept = await phones.add(pixel);
      let cut = 0;
      access.phones.connected(pixel.publicKey, () => {
        cut += 1;
      });
      await phones.revoke(kept.id);
      expect(cut).toBe(1);
      expect(access.phones.isPaired(pixel.publicKey)).toBe(false);
    });

    it("throws for a phone revoked between isPaired and connected, and counts it nowhere", async () => {
      const { access, phones } = await hostOnManualTime();
      const kept = await phones.add(pixel);
      expect(access.phones.isPaired(pixel.publicKey)).toBe(true);
      await phones.revoke(kept.id);
      expect(() => access.phones.connected(pixel.publicKey, () => {})).toThrow();
      expect(phones.phones).toEqual([]);
    });

    it("says why when a last seen can't be saved, and the session still ends", async () => {
      const { access, phones, file, logged } = await hostOnManualTime();
      await phones.add(pixel);
      const session = access.phones.connected(pixel.publicKey, () => {});
      file.failing = true;
      expect(() => session.end()).not.toThrow();
      await settled();
      expect(phones.find(pixel.publicKey)?.connected).toBe(false);
      expect(logged.join("")).toContain("last seen couldn't be saved");
    });
  });
});
