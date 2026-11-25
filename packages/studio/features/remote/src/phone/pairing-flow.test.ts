import { decodePairingQr, type PairingQrPayload } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { FakePhoneTunnel } from "../test-support/phone-tunnel.ts";
import type { NearbyId } from "./nearby-computers.ts";
import { NOT_HALONIC_MS, PhonePairingFlow, type PhoneScanner, RESCAN_MS } from "./pairing-flow.ts";
import type {
  ComputerId,
  PairingId,
  PairingOutcome,
  PairingStep,
  PhoneTunnel,
} from "./phone-tunnel.ts";

const payload: PairingQrPayload = {
  hostKey: new Uint8Array(32).fill(7),
  code: "7KQ2M4XD9TH6",
  hostName: "Tim's laptop",
  endpoints: ["wss://studio.tail1234.ts.net"],
};

type ScanAnswer = Awaited<ReturnType<PhoneScanner["scan"]>>;

/** A scanner that answers each scan from a script, then waits until closed. */
class ScriptedScanner implements PhoneScanner {
  closes = 0;
  scans = 0;
  private release: ((answer: ScanAnswer) => void) | undefined;
  private readonly answers: ScanAnswer[];
  constructor(answers: ScanAnswer[]) {
    this.answers = answers;
  }
  scan(): Promise<ScanAnswer> {
    this.scans += 1;
    const answer = this.answers.shift();
    if (answer !== undefined) return Promise.resolve(answer);
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }
  async close(): Promise<void> {
    this.closes += 1;
    this.release?.({ kind: "closed" });
  }
}

/** Lets every waiting promise run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function manualTimers() {
  const pending = new Set<() => void>();
  const waits: number[] = [];
  return {
    pending,
    waits,
    setTimer: (run: () => void, ms: number) => {
      waits.push(ms);
      pending.add(run);
      return () => pending.delete(run);
    },
    fire: () => {
      for (const run of [...pending]) {
        pending.delete(run);
        run();
      }
    },
  };
}

const laptop = { name: "Tim's laptop", endpoint: "192.168.1.20:4100", wifi: true };

verifies("remote.phone-pairing", () => {
  it("scans a code, shows the check code, and shows Paired after Allow", async () => {
    const tunnel = new FakePhoneTunnel();
    const flow = new PhonePairingFlow(
      tunnel,
      new ScriptedScanner([{ kind: "pairingCode", payload }]),
    );
    const seen: string[] = [];
    flow.subscribe(() => seen.push(flow.view.step));
    flow.scan();
    await settle();
    expect(seen).toEqual(["scanning", "connecting", "check", "paired"]);
    const start = tunnel.started[0];
    expect(start?.route).toBe("qr");
    expect(start?.route === "qr" && decodePairingQr(start.scanned)?.hostName).toBe("Tim's laptop");
  });

  it("pairs a typed code with the picked computer, spaces and case ignored", async () => {
    const tunnel = new FakePhoneTunnel();
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]), {
      again: "computer-1" as ComputerId,
    });
    flow.typeInstead();
    flow.pairTyped("7kq2 · m4xd · 9th6", laptop);
    expect(flow.view).toEqual({ step: "connecting", route: "typed" });
    await settle();
    expect(tunnel.started).toEqual([
      { route: "typed", code: "7KQ2M4XD9TH6", endpoint: laptop.endpoint, again: "computer-1" },
    ]);
    expect(flow.view.step).toBe("paired");
  });

  it("says a code isn't Halonic's once, keeps looking, and brings the hint back 3 s later", async () => {
    const timers = manualTimers();
    const scanner = new ScriptedScanner([{ kind: "notAPairingCode" }, { kind: "notAPairingCode" }]);
    const flow = new PhonePairingFlow(new FakePhoneTunnel(), scanner, timers);
    const seen: unknown[] = [];
    flow.subscribe(() => seen.push(flow.view));
    flow.scan();
    await settle();
    expect(seen).toEqual([
      { step: "scanning", notHalonic: false },
      { step: "scanning", notHalonic: true },
    ]);
    expect(NOT_HALONIC_MS).toBe(3000);
    timers.fire();
    expect(flow.view).toEqual({ step: "scanning", notHalonic: false });
  });

  it("pauses before it looks again after a code that isn't Halonic's, so the camera doesn't cycle", async () => {
    const timers = manualTimers();
    const scanner = new ScriptedScanner([{ kind: "notAPairingCode" }]);
    const flow = new PhonePairingFlow(new FakePhoneTunnel(), scanner, timers);
    flow.scan();
    await settle();
    expect(scanner.scans).toBe(1);
    expect(timers.waits).toContain(RESCAN_MS);
    timers.fire();
    await settle();
    expect(scanner.scans).toBe(2);
    flow.closeScanner();
    timers.fire();
    await settle();
    expect(scanner.scans).toBe(2);
  });

  it("closes the camera on close and drops what the scanner says after", async () => {
    const scanner = new ScriptedScanner([]);
    const flow = new PhonePairingFlow(new FakePhoneTunnel(), scanner);
    flow.scan();
    flow.closeScanner();
    await settle();
    expect(scanner.closes).toBe(1);
    expect(flow.view).toEqual({ step: "start", scanner: true });
  });

  it("offers settings without camera access, and only the typed route without a scanner", async () => {
    const flow = new PhonePairingFlow(
      new FakePhoneTunnel(),
      new ScriptedScanner([{ kind: "noCamera", askAgain: false }, { kind: "noScanner" }]),
    );
    flow.scan();
    await settle();
    expect(flow.view).toEqual({ step: "noCamera" });
    flow.scan();
    await settle();
    expect(flow.view).toEqual({ step: "start", scanner: false });
  });

  it("keeps offering only the typed route after Cancel on a build without a scanner", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextStep = { kind: "cant-reach", reason: "unreachable" };
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([{ kind: "noScanner" }]));
    flow.scan();
    await settle();
    flow.typeInstead();
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view.step).toBe("problem");
    flow.cancel();
    expect(flow.view).toEqual({ step: "start", scanner: false });
  });

  it("ends the pairing on Cancel, and a late Allow doesn't show Paired", async () => {
    const tunnel = new FakePhoneTunnel();
    const paired = await tunnel.waitForAllow("pairing-0" as PairingId);
    expect(paired.kind).toBe("paired");
    let allow: (() => void) | undefined;
    tunnel.waitForAllow = (pairing) =>
      new Promise((resolve) => {
        allow = () => resolve(paired);
        void pairing;
      });
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view).toEqual({ step: "check", checkCode: "4F72KQ", computerName: "Tim's laptop" });
    flow.cancel();
    allow?.();
    await settle();
    expect(tunnel.calls).toEqual(["cancel pairing-1"]);
    expect(flow.view).toEqual({ step: "start", scanner: true });
  });

  it("ends a pairing whose check code arrives after Cancel", async () => {
    let answer: ((step: PairingStep) => void) | undefined;
    const tunnel = new FakePhoneTunnel();
    tunnel.startPairing = () => new Promise<PairingStep>((resolve) => (answer = resolve));
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    flow.cancel();
    answer?.({ kind: "check", pairing: "late" as PairingId, checkCode: "X", computerName: "Y" });
    await settle();
    expect(tunnel.calls).toEqual(["cancel late"]);
    expect(flow.view.step).toBe("start");
  });

  it("ends the shell's pairing when waiting for Allow fails, before Try again starts anew", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.waitForAllow = (): Promise<PairingOutcome> => Promise.reject(new Error("shell gone"));
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(tunnel.calls).toEqual(["cancel pairing-1"]);
    expect(flow.view.step).toBe("problem");
  });

  it("sends the same code to the same computer on Try again", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextStep = { kind: "cant-reach", reason: "timeout" };
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view).toEqual({
      step: "problem",
      problem: expect.objectContaining({ screen: "unreachable", wifi: true }),
      route: "typed",
      computerName: "Tim's laptop",
    });
    flow.tryAgain();
    await settle();
    expect(tunnel.started).toHaveLength(2);
    expect(tunnel.started[1]).toEqual(tunnel.started[0]);
  });
});

verifies("remote.phone-pairing-problems", () => {
  it("brings back the typed route with the tries left, and Type a code again after a problem", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextStep = { kind: "wrong-code", triesLeft: 3 };
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view).toEqual({ step: "typed", triesLeft: 3 });
    tunnel.nextStep = { kind: "code-used" };
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view.step === "problem" && flow.view.problem).toEqual({ screen: "used" });
    flow.again();
    expect(flow.view).toEqual({ step: "typed" });
  });

  it("reads a tunnel that fails to answer as Can't reach, never as Don't allow", async () => {
    const tunnel: PhoneTunnel = new FakePhoneTunnel();
    tunnel.startPairing = () => Promise.reject(new Error("shell gone"));
    const flow = new PhonePairingFlow(
      tunnel,
      new ScriptedScanner([{ kind: "pairingCode", payload }]),
    );
    flow.scan();
    await settle();
    expect(flow.view).toEqual({
      step: "problem",
      problem: expect.objectContaining({ screen: "unreachable", wifi: false }),
      route: "qr",
      computerName: "Tim's laptop",
    });
  });

  it("shows the phone's own problem, not the computer's, when Nearby devices is turned down", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextStep = { kind: "no-local-network", askAgain: false };
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    flow.pairTyped("7KQ2M4XD9TH6", laptop);
    await settle();
    expect(flow.view).toEqual({
      step: "phoneProblem",
      problem: { kind: "no-local-network", askAgain: false },
      route: "typed",
      computerName: "Tim's laptop",
    });
  });

  it("ends the shell's pairing and says so when the phone can't save the new key", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextOutcome = { kind: "keys-unavailable" };
    const flow = new PhonePairingFlow(
      tunnel,
      new ScriptedScanner([{ kind: "pairingCode", payload }]),
    );
    flow.scan();
    await settle();
    expect(tunnel.calls).toEqual(["cancel pairing-1"]);
    expect(flow.view).toEqual({
      step: "phoneProblem",
      problem: { kind: "keys-unavailable" },
      route: "qr",
      computerName: "Tim's laptop",
    });
  });
});

verifies("remote.phone-typed-picker", () => {
  it("sends a computer found on this Wi-Fi by its id, and keeps the draft for a wrong code", async () => {
    const tunnel = new FakePhoneTunnel();
    tunnel.nextStep = { kind: "wrong-code", triesLeft: 4 };
    const flow = new PhonePairingFlow(tunnel, new ScriptedScanner([]));
    const picked = { name: "Tim's laptop", nearby: "nearby-1" as NearbyId };
    flow.typeInstead();
    flow.pairTyped("7kq2 m4xd 9th6", picked);
    await settle();
    expect(tunnel.started).toEqual([{ route: "typed", code: "7KQ2M4XD9TH6", nearby: "nearby-1" }]);
    expect(flow.view).toEqual({ step: "typed", triesLeft: 4 });
    expect(flow.typedDraft).toEqual({ code: "7kq2 m4xd 9th6", computer: picked });
  });
});
