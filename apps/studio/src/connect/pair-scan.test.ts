import { encodePairingQr, pairingQrPrefix } from "@halonicjs/ports";
import type { TauriIpc } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { readPairingScan, tauriPairingScanner } from "./pair-scan.ts";

/** Records each call into the shell and answers it with `answer`. */
class FakeInternals implements TauriIpc {
  readonly calls: { command: string; args: Record<string, unknown> | undefined }[] = [];
  private readonly answer: unknown;

  constructor(answer: unknown = null) {
    this.answer = answer;
  }

  invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ command, args });
    return Promise.resolve(this.answer);
  }
}

const written = encodePairingQr({
  hostKey: Uint8Array.from({ length: 32 }, (_, index) => index),
  code: "7KQ2M9XF4HTA",
  hostName: "Test laptop",
  endpoints: ["https://192.168.1.20:4281", "tcp:10.0.0.5:4281"],
});

const text = written.text;

/** What the code says: the endpoints are the ones that fitted. */
const payload = {
  hostKey: Uint8Array.from({ length: 32 }, (_, index) => index),
  code: "7KQ2M9XF4HTA",
  hostName: "Test laptop",
  endpoints: written.endpoints,
};

/** The same record with another version byte, as a newer app would write it. */
function withVersion(version: number): string {
  const record = Buffer.from(text.slice(pairingQrPrefix.length), "base64url");
  record[0] = version;
  return pairingQrPrefix + record.toString("base64url");
}

afterEach(() => {
  vi.restoreAllMocks();
});

verifies("studio.connect.pair-scan", () => {
  it("decodes a scanned pairing code into the computer's key, code, name and addresses", () => {
    expect(readPairingScan({ kind: "scanned", text })).toEqual({ kind: "pairingCode", payload });
  });

  it("refuses a pairing code of an unknown version", () => {
    expect(readPairingScan({ kind: "scanned", text: withVersion(1) }).kind).toBe("pairingCode");
    for (const version of [0, 2, 255]) {
      expect(readPairingScan({ kind: "scanned", text: withVersion(version) })).toEqual({
        kind: "notAPairingCode",
      });
    }
  });

  it("refuses a text the codec can't read", () => {
    for (const broken of [text.slice(0, -4), `${text}A`, `${pairingQrPrefix}`, "halonic-pair:!!"]) {
      expect(readPairingScan({ kind: "scanned", text: broken })).toEqual({
        kind: "notAPairingCode",
      });
    }
  });

  it("passes on what the shell says when there is no code", () => {
    for (const answer of [
      { kind: "notAPairingCode" },
      { kind: "closed" },
      { kind: "noCamera", askAgain: true },
      { kind: "noCamera", askAgain: false },
      { kind: "noScanner" },
    ]) {
      expect(readPairingScan(answer)).toEqual(answer);
    }
  });

  it("reads an answer it doesn't know as closed", () => {
    for (const answer of [
      null,
      "halonic-pair:AQ",
      { kind: "scanned" },
      { kind: "scanned", text, url: "https://example.com" },
      { kind: "opened" },
    ]) {
      expect(readPairingScan(answer)).toEqual({ kind: "closed" });
    }
  });

  it("asks only the shell's pair_scan, and fetches nothing from what it scanned", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const internals = new FakeInternals({ kind: "scanned", text });

    const scanned = await tauriPairingScanner(internals).scan();

    expect(scanned).toEqual({ kind: "pairingCode", payload });
    expect(internals.calls).toEqual([{ command: "pair_scan", args: undefined }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes the camera through the shell's pair_scan_cancel", async () => {
    const internals = new FakeInternals();

    await tauriPairingScanner(internals).close();

    expect(internals.calls).toEqual([{ command: "pair_scan_cancel", args: undefined }]);
  });
});
