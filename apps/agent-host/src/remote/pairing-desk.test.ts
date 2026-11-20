import { randomBytes } from "node:crypto";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { PairingDesk, type PairingTicket } from "./pairing-desk.ts";
import type { DeskEndReason, OpenPairing, PairingPhone } from "./pairing-types.ts";
import { ManualTime, settled } from "./remote-time.test-helper.ts";

const minute = 60_000;
const pixel: PairingPhone = {
  publicKey: new Uint8Array(32).fill(7),
  name: "Pixel 8",
  platform: "android",
};

/** A desk on manual time, with a dialog that records what it heard. */
function deskOnManualTime() {
  const time = new ManualTime();
  const desk = new PairingDesk({
    time,
    randomBytes: (length) => new Uint8Array(randomBytes(length)),
  });
  const heard: string[] = [];
  const ended: DeskEndReason[] = [];
  const paired: PairingPhone[] = [];
  let failPaired = false;
  let saved: Promise<void> = Promise.resolve();
  const watcher = {
    check: (check: { checkCode: string; phone: PairingPhone; allowBy: Date }) => {
      heard.push(`check ${check.checkCode} ${check.phone.name} ${check.allowBy.toISOString()}`);
    },
    paired: async (phone: PairingPhone) => {
      await saved;
      if (failPaired) throw new Error("the phone list couldn't be saved");
      paired.push(phone);
    },
    ended: (reason: DeskEndReason) => {
      ended.push(reason);
    },
  };
  const open = (): OpenPairing => {
    const pairing = desk.open(watcher);
    if (pairing === undefined) throw new Error("a pairing is already open");
    return pairing;
  };
  const ticket = (): PairingTicket => {
    const admission = desk.admit();
    if (!admission.admitted) throw new Error(`refused: ${admission.refusal.reason}`);
    return admission.ticket;
  };
  const failSaving = () => {
    failPaired = true;
  };
  /** Holds the next keep of a phone until the returned call. */
  const holdSaving = (): (() => void) => {
    let release = () => {};
    saved = new Promise((resolve) => {
      release = resolve;
    });
    return release;
  };
  return { time, desk, heard, ended, paired, open, ticket, failSaving, holdSaving };
}

/** Uses the code with the given ticket and gives the phone's verdict. */
function useCode(ticket: PairingTicket) {
  const use = ticket.useCode(pixel, "4F72KQ");
  if (!use.used) throw new Error(`refused: ${use.refusal.reason}`);
  return use.verdict;
}

verifies("agent-host.remote-pairing-rules", () => {
  describe("PairingDesk: one pairing, its code and the wait for Allow", () => {
    it("opens one pairing at a time, with a 12-symbol code that works for 5 minutes", async () => {
      const { time, desk, open } = deskOnManualTime();
      const pairing = open();
      expect(pairing.code).toMatch(/^[2-9A-HJKMNP-Z]{12}$/);
      expect(pairing.expiresAt.getTime() - time.now().getTime()).toBe(5 * minute);
      expect(desk.open({ check() {}, paired: async () => {}, ended() {} })).toBeUndefined();
      pairing.close();
      expect(desk.busy).toBe(false);
      expect(open().code).toMatch(/^[2-9A-HJKMNP-Z]{12}$/);
    });

    it("ends a code no phone used after 5 minutes, and refuses message 1 after it", async () => {
      const { time, desk, ended, open } = deskOnManualTime();
      open();
      await time.advance(5 * minute - 1);
      expect(ended).toEqual([]);
      await time.advance(1);
      expect(ended).toEqual(["code-expired"]);
      expect(desk.admit()).toEqual({
        admitted: false,
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
    });

    it("refuses message 1 while no pairing is open", () => {
      const { desk } = deskOnManualTime();
      expect(desk.admit()).toEqual({
        admitted: false,
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
    });

    it("shows the check code, waits 2 minutes for Allow, and pairs the phone on Allow", async () => {
      const { time, desk, heard, paired, open, ticket } = deskOnManualTime();
      const pairing = open();
      await time.advance(4 * minute);
      const verdict = useCode(ticket());
      const allowBy = new Date(time.now().getTime() + 2 * minute).toISOString();
      expect(heard).toEqual([`check 4F72KQ Pixel 8 ${allowBy}`]);
      // Past the code's 5 minutes: once used, only the wait for Allow counts.
      await time.advance(2 * minute - 1);
      await pairing.allow();
      expect(paired).toEqual([pixel]);
      await expect(verdict).resolves.toEqual({ allowed: true });
      expect(desk.busy).toBe(false);
    });

    it("ends with allow-timed-out when Allow doesn't come in 2 minutes", async () => {
      const { time, ended, open, ticket } = deskOnManualTime();
      const pairing = open();
      const verdict = useCode(ticket());
      await time.advance(2 * minute);
      expect(ended).toEqual(["allow-timed-out"]);
      await expect(verdict).resolves.toEqual({ allowed: false, reason: "timed-out" });
      await expect(pairing.allow()).rejects.toThrow("check code");
      await time.advance(5 * minute);
      expect(ended).toEqual(["allow-timed-out"]);
    });

    it("pairs nothing on Don't allow, and the phone hears denied", async () => {
      const { ended, paired, open, ticket } = deskOnManualTime();
      const pairing = open();
      const verdict = useCode(ticket());
      pairing.deny();
      expect(ended).toEqual(["denied"]);
      expect(paired).toEqual([]);
      await expect(verdict).resolves.toEqual({ allowed: false, reason: "denied" });
    });

    it("refuses Allow and Don't allow before a phone used the code", async () => {
      const { open } = deskOnManualTime();
      const pairing = open();
      await expect(pairing.allow()).rejects.toThrow("check code");
      expect(() => pairing.deny()).toThrow("check code");
    });

    it("ends the code when the dialog closes, even while Allow is awaited", async () => {
      const { desk, ended, open, ticket } = deskOnManualTime();
      const pairing = open();
      const verdict = useCode(ticket());
      pairing.close();
      pairing.close();
      expect(ended).toEqual(["closed"]);
      await expect(verdict).resolves.toEqual({ allowed: false, reason: "denied" });
      expect(desk.admit()).toEqual({
        admitted: false,
        refusal: { reason: "code-ended", triesLeft: 0 },
      });
    });

    it("ends the pairing when the phone leaves while Allow is awaited", async () => {
      const { ended, open, ticket } = deskOnManualTime();
      open();
      const phone = ticket();
      const verdict = useCode(phone);
      phone.close();
      expect(ended).toEqual(["phone-left"]);
      await expect(verdict).resolves.toEqual({ allowed: false, reason: "timed-out" });
    });

    it("keeps Allow's outcome when the dialog closes or the phone leaves while the phone is kept", async () => {
      const { desk, ended, paired, open, ticket, holdSaving } = deskOnManualTime();
      const pairing = open();
      const phone = ticket();
      const verdict = useCode(phone);
      const release = holdSaving();
      const allowed = pairing.allow();
      pairing.close();
      phone.close();
      expect(desk.busy).toBe(true);
      release();
      await allowed;
      expect(paired).toEqual([pixel]);
      expect(ended).toEqual([]);
      await expect(verdict).resolves.toEqual({ allowed: true });
      expect(desk.busy).toBe(false);
    });

    it("ends the pairing as closed when the phone can't be kept, and Allow says why", async () => {
      const { ended, open, ticket, failSaving } = deskOnManualTime();
      const pairing = open();
      const verdict = useCode(ticket());
      failSaving();
      await expect(pairing.allow()).rejects.toThrow("couldn't be saved");
      expect(ended).toEqual(["closed"]);
      await expect(verdict).resolves.toEqual({ allowed: false, reason: "denied" });
    });
  });

  describe("PairingDesk: the code is used once", () => {
    it("lets the first message 3 that decrypts use the code, and refuses every later one", async () => {
      const { desk, open, ticket } = deskOnManualTime();
      open();
      const first = ticket();
      const second = ticket();
      useCode(first);
      expect(second.useCode(pixel, "9MX3TA")).toEqual({
        used: false,
        refusal: { reason: "code-used", triesLeft: 0 },
      });
      expect(desk.admit()).toEqual({
        admitted: false,
        refusal: { reason: "code-used", triesLeft: 0 },
      });
    });

    it("counts a failed message 3 after the code was used, and answers code-used", async () => {
      const { open, ticket } = deskOnManualTime();
      open();
      const first = ticket();
      const late = ticket();
      useCode(first);
      expect(late.wrongTry()).toEqual({ reason: "code-used", triesLeft: 0 });
    });

    it("refuses to report a handshake twice", () => {
      const { open, ticket } = deskOnManualTime();
      open();
      const phone = ticket();
      phone.wrongTry();
      expect(() => phone.wrongTry()).toThrow("already ended");
      expect(() => phone.useCode(pixel, "4F72KQ")).toThrow("already ended");
      phone.close();
    });
  });

  describe("PairingDesk: wrong tries", () => {
    it("ends a code at its fifth wrong try, saying how many are left before", async () => {
      const { ended, open, ticket } = deskOnManualTime();
      open();
      const left = [1, 2, 3, 4].map(() => ticket().wrongTry());
      expect(left.map((refusal) => refusal.triesLeft)).toEqual([4, 3, 2, 1]);
      expect(left.every((refusal) => refusal.reason === "wrong-code")).toBe(true);
      expect(ticket().wrongTry()).toEqual({ reason: "code-ended", triesLeft: 0 });
      expect(ended).toEqual(["too-many-tries"]);
    });

    it("counts a handshake that ends before message 3 as a wrong try", async () => {
      const { open, ticket } = deskOnManualTime();
      open();
      ticket().close();
      expect(ticket().wrongTry()).toEqual({ reason: "wrong-code", triesLeft: 3 });
    });

    it("refuses message 1 after 10 failed tries in a minute, across codes, until the minute is over", async () => {
      const { time, desk, open, ticket } = deskOnManualTime();
      for (const _code of [1, 2]) {
        open();
        for (const _try of [1, 2, 3, 4, 5]) ticket().wrongTry();
        await settled();
      }
      open();
      expect(desk.admit()).toEqual({
        admitted: false,
        refusal: { reason: "rate-limited", triesLeft: 0 },
      });
      await time.advance(minute - 1);
      expect(desk.admit().admitted).toBe(false);
      await time.advance(1);
      expect(desk.admit().admitted).toBe(true);
    });
  });
});
