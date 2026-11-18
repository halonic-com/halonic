import { hkdfSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  checkCodeFromBytes,
  checkCodeInfo,
  decodePairingQr,
  encodePairingQr,
  formatCheckCode,
  formatPairingCode,
  newPairingCode,
  pairingAlphabet,
  pairingPskInfo,
  pairingPskInput,
  pairingQrMaxBytes,
  pairingQrPrefix,
  readCheckCode,
  readPairingCode,
} from "./pairing-codes.ts";

interface Vectors {
  pairingCodes: { randomBytes: string; code: string; shown: string; psk: string }[];
  checkCodes: { handshakeHash: string; hkdf: string; checkCode: string; shown: string }[];
  qrPayloads: {
    /** The host key, hex; named so a secret scanner doesn't take a public key for a secret. */
    hostPublic: string;
    code: string;
    hostName: string;
    given: string[];
    endpoints: string[];
    text: string;
  }[];
}

const vectors: Vectors = JSON.parse(
  readFileSync(new URL("./golden/pairing-vectors.json", import.meta.url), "utf8"),
);
const bytes = (hex: string) => new Uint8Array(Buffer.from(hex, "hex"));
const hex = (data: Uint8Array) => Buffer.from(data).toString("hex");
const hkdf = (input: Uint8Array, info: string, length: number) =>
  new Uint8Array(hkdfSync("sha256", input, new Uint8Array(), info, length));

/** The byte capacity of a version 8 QR code at error correction level M, in byte mode (ISO/IEC 18004, table 7). */
const version8LevelMBytes = 152;
const hostKey = bytes("09f10e4bdc37a471382a5aa37101705b258c9b246fbcfa1e8727723214f1a738");

verifies("ports.pairing-codes", () => {
  describe("the pairing code", () => {
    it("uses 31 symbols without 0, O, 1, I or L", () => {
      expect(pairingAlphabet).toHaveLength(31);
      expect(new Set(pairingAlphabet).size).toBe(31);
      expect(pairingAlphabet).not.toMatch(/[0O1IL]/);
    });

    it.each(vectors.pairingCodes)("makes $code from its random bytes, and its psk", (vector) => {
      const code = newPairingCode(() => bytes(vector.randomBytes));
      expect(code).toBe(vector.code);
      expect(formatPairingCode(code)).toBe(vector.shown);
      expect(hex(hkdf(pairingPskInput(code), pairingPskInfo, 32))).toBe(vector.psk);
    });

    it("skips bytes of 248 and more and draws again until it has 12 symbols", () => {
      const draws = [new Uint8Array(16).fill(248), Uint8Array.from({ length: 16 }, (_, i) => i)];
      const code = newPairingCode(() => draws.shift() ?? new Uint8Array(16));
      expect(code).toBe("23456789ABCD");
      expect(draws).toHaveLength(0);
    });

    it("reads a typed code in any case, with spaces, dots and dashes", () => {
      expect(readPairingCode(" xx7a-9q36.kfb3 ")).toBe("XX7A9Q36KFB3");
      expect(readPairingCode("XX7A · 9Q36 · KFB3")).toBe("XX7A9Q36KFB3");
    });

    it.each(["XX7A9Q36KFB", "XX7A9Q36KFB33", "XX7A9Q36KFB0", "XX7A9Q36KFBO", "XX7A9Q36KFB1", ""])(
      "refuses %j",
      (typed) => {
        expect(readPairingCode(typed)).toBeUndefined();
        expect(() => formatPairingCode(typed)).toThrow(RangeError);
        expect(() => pairingPskInput(typed)).toThrow(RangeError);
      },
    );
  });

  describe("the check code", () => {
    it.each(vectors.checkCodes)("is $checkCode for HKDF bytes $hkdf", (vector) => {
      if (vector.handshakeHash !== "") {
        expect(hex(hkdf(bytes(vector.handshakeHash), checkCodeInfo, 8))).toBe(vector.hkdf);
      }
      const code = checkCodeFromBytes(bytes(vector.hkdf));
      expect(code).toBe(vector.checkCode);
      expect(formatCheckCode(code)).toBe(vector.shown);
      expect(readCheckCode(vector.shown)).toBe(code);
    });

    it("needs exactly 8 bytes", () => {
      expect(() => checkCodeFromBytes(new Uint8Array(7))).toThrow(RangeError);
      expect(() => checkCodeFromBytes(new Uint8Array(32))).toThrow(RangeError);
    });

    it("refuses a check code that isn't 6 symbols", () => {
      expect(readCheckCode("4F7 · 2K")).toBeUndefined();
      expect(() => formatCheckCode("4F72KQ0")).toThrow(RangeError);
    });
  });

  describe("the QR payload", () => {
    it.each(vectors.qrPayloads)("writes and reads $text", (vector) => {
      const payload = { ...vector, hostKey: bytes(vector.hostPublic), endpoints: vector.given };
      expect(encodePairingQr(payload)).toEqual({ text: vector.text, endpoints: vector.endpoints });
      expect(decodePairingQr(vector.text)).toEqual({
        hostKey: bytes(vector.hostPublic),
        code: vector.code,
        hostName: vector.hostName,
        endpoints: vector.endpoints,
      });
    });

    it("never grows past a version 8 QR code at level M, at the worst case", () => {
      const worst = encodePairingQr({
        hostKey,
        code: "ZZZZZZZZZZZZ",
        hostName: "n".repeat(100),
        endpoints: ["tcp:1.2.3.4:5", "tcp:1.2.3.4:6", "tcp:1.2.3.4:7", "tcp:1.2.3.4:8"],
      });
      expect(worst.endpoints).toHaveLength(1);
      for (let length = 1; length <= 120; length += 1) {
        const { text } = encodePairingQr({
          hostKey,
          code: "ZZZZZZZZZZZZ",
          hostName: "€".repeat(20),
          endpoints: [`tcp:${"h".repeat(length)}`, "tcp:a:1", "tcp:b:2", "tcp:c:3"].slice(
            length % 2,
          ),
        });
        expect(text.length).toBeLessThanOrEqual(pairingQrMaxBytes);
      }
      expect(pairingQrMaxBytes).toBeLessThanOrEqual(version8LevelMBytes);
    });

    it("keeps endpoints in order, leaves out one that doesn't fit and keeps at most three", () => {
      const result = encodePairingQr({
        hostKey,
        code: "XX7A9Q36KFB3",
        hostName: "Pixel",
        endpoints: [
          "tcp:192.168.1.20:4100",
          `wss:${"long".repeat(20)}.ts.net:4100`,
          "tcp:10.0.0.2:4100",
          "tcp:10.0.0.3:4100",
          "tcp:10.0.0.4:4100",
        ],
      });
      expect(result.endpoints).toEqual(["tcp:192.168.1.20:4100", "tcp:10.0.0.2:4100"]);
    });

    it("cuts a long host name at a whole character to 32 bytes", () => {
      const { text } = encodePairingQr({
        hostKey,
        code: "XX7A9Q36KFB3",
        hostName: `${"a".repeat(30)}€b`,
        endpoints: ["tcp:10.0.0.2:4100"],
      });
      expect(decodePairingQr(text)?.hostName).toBe("a".repeat(30));
    });

    it.each([
      ["a short key", { hostKey: new Uint8Array(31) }],
      ["a bad code", { code: "XX7A9Q36KFB0" }],
      ["an http endpoint", { endpoints: ["http://10.0.0.2:4100"] }],
      ["no endpoint", { endpoints: [] }],
      ["no endpoint that fits", { endpoints: [`tcp:${"h".repeat(200)}`] }],
    ])("refuses to write %s", (_, change) => {
      const payload = {
        hostKey,
        code: "XX7A9Q36KFB3",
        hostName: "Pixel",
        endpoints: ["tcp:10.0.0.2:4100"],
        ...change,
      };
      expect(() => encodePairingQr(payload)).toThrow(RangeError);
    });

    const good = vectors.qrPayloads[1]?.text ?? "";
    const record = Buffer.from(good.slice(pairingQrPrefix.length), "base64url");
    const withRecord = (change: (bytes: Buffer) => Buffer) =>
      pairingQrPrefix + change(Buffer.from(record)).toString("base64url");

    it.each([
      ["another prefix", good.replace("halonic-pair:", "halonic-pin:")],
      ["padding", `${good}=`],
      ["a character outside base64url", `${good.slice(0, -1)}+`],
      ["a non-canonical last character", `${good.slice(0, -1)}B`],
      ["text over 150 bytes", good + "A".repeat(40)],
      ["another version", withRecord((b) => Buffer.concat([Buffer.from([2]), b.subarray(1)]))],
      ["a code past 31^12", withRecord((b) => Buffer.from(b.fill(0xff, 33, 41)))],
      ["a missing byte", withRecord((b) => b.subarray(0, -1))],
      ["an extra byte", withRecord((b) => Buffer.concat([b, Buffer.from([0])]))],
      [
        "no endpoint",
        withRecord((b) => Buffer.concat([b.subarray(0, 42 + (b[41] ?? 0)), Buffer.of(0)])),
      ],
      ["a name that isn't UTF-8", withRecord((b) => Buffer.from(b.fill(0xff, 42, 43)))],
      [
        "an http endpoint",
        withRecord((b) => Buffer.from(b.toString("latin1").replace("tcp:", "ftp:"), "latin1")),
      ],
    ])("reads %s as no payload", (_, text) => {
      expect(decodePairingQr(text)).toBeUndefined();
    });
  });
});
