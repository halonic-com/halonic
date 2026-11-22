import { encodePairingQr } from "@halonicjs/ports";
import type { ComputerId, PairingId, PhoneStatus } from "@halonicjs/studio-feature-remote/phone";
import type { TauriCallbacks, TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { TauriPhoneTunnel, tauriPhoneTunnel } from "./tauri-phone-tunnel.ts";

/**
 * The shell's side, in memory: each command answers what the test set, or rejects as a command
 * the page may not call; a channel's messages go to the callback its argument names.
 */
class FakeShell implements TauriIpc, TauriCallbacks {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  readonly answers = new Map<string, unknown>();
  readonly #callbacks = new Map<number, (message: unknown) => void>();
  #nextCallback = 1;

  async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    if (!this.answers.has(command)) throw `command ${command} not allowed`;
    return this.answers.get(command);
  }

  transformCallback(callback: (message: unknown) => void): number {
    const id = this.#nextCallback++;
    this.#callbacks.set(id, callback);
    return id;
  }

  unregisterCallback(id: number): void {
    this.#callbacks.delete(id);
  }

  /** The commands called, in order. */
  commands(): string[] {
    return this.calls.map((call) => call.command);
  }

  /** Sends the `index`th message on the channel the last watch handed in. */
  sendStatus(index: number, computer: string, status: object): void {
    const watch = this.calls.findLast((call) => call.command === "phone_tunnel_watch");
    const argument = String(watch?.args?.["onEvent"]);
    const id = Number(argument.slice("__CHANNEL__:".length));
    this.#callbacks.get(id)?.({ index, message: { kind: "status", computer, status } });
  }

  /** How many channels are still registered. */
  openChannels(): number {
    return this.#callbacks.size;
  }
}

const check = { kind: "check", computerName: "Test laptop", checkCode: "4F72KQ" };
const hostKey = Uint8Array.from({ length: 32 }, () => 0xfb);
const scanned = encodePairingQr({
  hostKey,
  code: "7KQ2M9XF4HTA",
  hostName: "Test laptop",
  endpoints: ["tcp://192.168.1.20:4100", "wss://studio.tail1234.ts.net"],
}).text;

function tunnelWith(answers: Record<string, unknown> = {}) {
  const shell = new FakeShell();
  for (const [command, answer] of Object.entries(answers)) shell.answers.set(command, answer);
  const reported: string[] = [];
  return { shell, reported, tunnel: new TauriPhoneTunnel(shell, (line) => reported.push(line)) };
}

verifies("studio.connect.phone-tunnel", () => {
  it("is there only inside the shell", () => {
    expect(tauriPhoneTunnel({}, () => undefined)).toBeUndefined();
    const page = { __TAURI_INTERNALS__: new FakeShell() };
    expect(tauriPhoneTunnel(page, () => undefined)).toBeInstanceOf(TauriPhoneTunnel);
  });

  describe("pairing", () => {
    it("hands the shell the scanned code's key, code and endpoints, never the scanned text", async () => {
      const { shell, tunnel } = tunnelWith({ phone_pair_start: check });
      const step = await tunnel.startPairing({
        route: "qr",
        scanned,
        again: "c1" as ComputerId,
      });
      expect(step).toEqual({ ...check, pairing: "pairing-1" });
      expect(shell.calls).toEqual([
        {
          command: "phone_pair_start",
          args: {
            start: {
              route: "qr",
              hostKey: Buffer.from(hostKey).toString("base64url"),
              code: "7KQ2M9XF4HTA",
              endpoints: ["tcp://192.168.1.20:4100", "wss://studio.tail1234.ts.net"],
              again: "c1",
            },
          },
        },
      ]);
    });

    it("answers bad-start for a scanned text that doesn't decode, without calling the shell", async () => {
      const { shell, tunnel } = tunnelWith({ phone_pair_start: check });
      const step = await tunnel.startPairing({ route: "qr", scanned: "halonic-pair:AAAA" });
      expect(step).toEqual({ kind: "bad-start" });
      expect(shell.calls).toEqual([]);
    });

    it("reaches a computer found on this Wi-Fi over tcp and keeps a paired computer's endpoint", async () => {
      const { shell, tunnel } = tunnelWith({ phone_pair_start: check });
      await tunnel.startPairing({
        route: "typed",
        code: "7KQ2M9XF4HTA",
        endpoint: "192.168.1.20:4100",
      });
      const endpoint = "wss://studio.tail1234.ts.net";
      await tunnel.startPairing({ route: "typed", code: "7KQ2M9XF4HTA", endpoint });
      expect(shell.calls.map((call) => call.args)).toEqual([
        { start: { route: "typed", code: "7KQ2M9XF4HTA", endpoints: ["tcp://192.168.1.20:4100"] } },
        { start: { route: "typed", code: "7KQ2M9XF4HTA", endpoints: [endpoint] } },
      ]);
    });

    it("waits for Allow and reads the shell's outcome", async () => {
      const { shell, tunnel } = tunnelWith({
        phone_pair_start: check,
        phone_pair_wait: { kind: "denied" },
      });
      const step = await tunnel.startPairing({ route: "qr", scanned });
      if (step.kind !== "check") throw new Error(`no check code: ${step.kind}`);
      expect(await tunnel.waitForAllow(step.pairing)).toEqual({ kind: "refused" });
      expect(shell.commands()).toEqual(["phone_pair_start", "phone_pair_wait"]);
    });

    it("keeps a wait or a cancel for a replaced pairing away from the newer one", async () => {
      const { shell, tunnel } = tunnelWith({ phone_pair_start: check, phone_pair_cancel: null });
      await tunnel.startPairing({ route: "qr", scanned });
      await tunnel.startPairing({ route: "qr", scanned });
      const first = "pairing-1" as PairingId;
      await tunnel.cancelPairing(first);
      expect(await tunnel.waitForAllow(first)).toEqual({ kind: "code-ended" });
      expect(shell.commands()).toEqual(["phone_pair_start", "phone_pair_start"]);
      await tunnel.cancelPairing("pairing-2" as PairingId);
      expect(shell.commands().at(-1)).toBe("phone_pair_cancel");
    });

    it("rejects when the shell refuses the command", async () => {
      const { tunnel } = tunnelWith();
      await expect(tunnel.startPairing({ route: "qr", scanned })).rejects.toBe(
        "command phone_pair_start not allowed",
      );
    });
  });

  describe("paired computers", () => {
    it("lists, forgets, connects and disconnects by the computer's id", async () => {
      const { shell, tunnel } = tunnelWith({
        phone_computers: { kind: "computers", computers: [] },
        phone_forget: { kind: "forgotten" },
        phone_connect: { kind: "connecting" },
        phone_disconnect: null,
      });
      const computer = "c1" as ComputerId;
      expect(await tunnel.pairedComputers()).toEqual([]);
      expect(await tunnel.forget(computer)).toEqual({ kind: "forgotten" });
      expect(await tunnel.connect(computer)).toEqual({ kind: "connecting" });
      await tunnel.disconnect(computer);
      expect(shell.calls).toEqual([
        { command: "phone_computers", args: undefined },
        { command: "phone_forget", args: { computer: "c1" } },
        { command: "phone_connect", args: { computer: "c1" } },
        { command: "phone_disconnect", args: { computer: "c1" } },
      ]);
    });
  });

  describe("statuses", () => {
    it("watches on one channel, and gives a later listener the latest statuses first", async () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const first: [string, PhoneStatus][] = [];
      tunnel.onStatus((computer, status) => first.push([computer, status]));
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendStatus(1, "c1", { state: "connected" });
      const later: [string, PhoneStatus][] = [];
      tunnel.onStatus((computer, status) => later.push([computer, status]));
      expect(first).toEqual([
        ["c1", { state: "connecting" }],
        ["c1", { state: "connected" }],
      ]);
      expect(later).toEqual([["c1", { state: "connected" }]]);
      expect(shell.commands()).toEqual(["phone_tunnel_watch"]);
    });

    it("keeps the one channel when the last listener goes, so the next doesn't watch again", async () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const stop = tunnel.onStatus(() => undefined);
      stop();
      stop();
      expect(shell.openChannels()).toBe(1);
      const next: [string, PhoneStatus][] = [];
      tunnel.onStatus((computer, status) => next.push([computer, status]));
      shell.sendStatus(0, "c1", { state: "connected" });
      expect(next).toEqual([["c1", { state: "connected" }]]);
      expect(shell.openChannels()).toBe(1);
      expect(shell.commands()).toEqual(["phone_tunnel_watch"]);
    });

    it("keeps the statuses sent while nobody listens for the next listener", async () => {
      const { shell, tunnel } = tunnelWith({ phone_tunnel_watch: true });
      const gone: [string, PhoneStatus][] = [];
      const stop = tunnel.onStatus((computer, status) => gone.push([computer, status]));
      stop();
      shell.sendStatus(0, "c1", { state: "connecting" });
      shell.sendStatus(1, "c1", { state: "connected" });
      const next: [string, PhoneStatus][] = [];
      tunnel.onStatus((computer, status) => next.push([computer, status]));
      expect(gone).toEqual([]);
      expect(next).toEqual([["c1", { state: "connected" }]]);
    });

    it("reports a watch the shell refuses, as it does off the app's own page, and doesn't ask again", async () => {
      const { shell, reported, tunnel } = tunnelWith({ phone_tunnel_watch: false });
      tunnel.onStatus(() => undefined)();
      await Promise.resolve();
      await Promise.resolve();
      tunnel.onStatus(() => undefined);
      expect(reported).toEqual(["phone_tunnel_watch refused the watch"]);
      expect(shell.commands()).toEqual(["phone_tunnel_watch"]);
    });
  });
});
