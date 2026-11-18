import { verifies } from "@halonicjs/testing-spec";
import jsQRModule from "jsqr";
import { describe, expect, it } from "vitest";
import upstream from "./fixtures/upstream-matrices.json" with { type: "json" };
import { Ecc, QrCode } from "./qr-code.ts";

// jsqr is CommonJS with `exports.default`; depending on the loader its default import is the
// function or the exports object.
type Decode = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => {
  binaryData: number[];
} | null;
const jsQR: Decode =
  typeof jsQRModule === "function"
    ? (jsQRModule as Decode)
    : (jsQRModule as unknown as { default: Decode }).default;

const levels = { LOW: Ecc.LOW, MEDIUM: Ecc.MEDIUM, QUARTILE: Ecc.QUARTILE, HIGH: Ecc.HIGH };
type Level = keyof typeof levels;

function fromHex(hex: string): number[] {
  return Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

// The matrix in the fixture's form: each row as hex, dark = 1, padded to a whole hex digit.
function rowsOf(qr: QrCode): string[] {
  return Array.from({ length: qr.size }, (_, y) => {
    let bits = "";
    for (let x = 0; x < qr.size; x++) bits += qr.getModule(x, y) ? "1" : "0";
    bits = bits.padEnd(Math.ceil(bits.length / 4) * 4, "0");
    return (bits.match(/.{4}/g) ?? [])
      .map((nibble) => Number.parseInt(nibble, 2).toString(16))
      .join("");
  });
}

// An RGBA image of the symbol with a 4-module quiet zone, `scale` pixels per module, as QrTile draws it.
function render(qr: QrCode, scale = 4): { pixels: Uint8ClampedArray; width: number } {
  const width = (qr.size + 8) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      if (qr.getModule(Math.floor(px / scale) - 4, Math.floor(py / scale) - 4)) {
        const at = (py * width + px) * 4;
        pixels.fill(0, at, at + 3);
      }
    }
  }
  return { pixels, width };
}

// Arbitrary but reproducible bytes.
function bytes(length: number, seed: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state >>> 24;
  });
}

const pairingPrefix = Array.from(new TextEncoder().encode("halonic-pair:"));

verifies("kit.qr-encoder", () => {
  describe("matches the matrices upstream's own code makes", () => {
    for (const sample of upstream.cases) {
      it(sample.name, () => {
        const options = sample as { minVersion?: number; mask?: number; boostEcl?: boolean };
        const qr = QrCode.encodeBinary(
          fromHex(sample.data),
          levels[sample.ecl as Level],
          options.minVersion ?? 1,
          40,
          options.mask ?? -1,
          options.boostEcl ?? true,
        );
        expect(qr.version).toBe(sample.expected.version);
        expect(qr.errorCorrectionLevel).toBe(levels[sample.expected.errorCorrectionLevel as Level]);
        expect(qr.mask).toBe(sample.expected.mask);
        expect(qr.size).toBe(qr.version * 4 + 17);
        expect(rowsOf(qr)).toEqual(sample.expected.rows);
      });
    }
  });

  describe("decodes back to the same bytes with jsqr", () => {
    const payloads: [string, number[], Ecc][] = [
      ["a short text", Array.from(new TextEncoder().encode("halonic-pair:AQ")), Ecc.MEDIUM],
      ["a 150-byte pairing payload", [...pairingPrefix, ...bytes(137, 7)], Ecc.MEDIUM],
      ["every byte value", Array.from({ length: 256 }, (_, i) => i), Ecc.LOW],
      ["bytes at ECC H", bytes(60, 21), Ecc.HIGH],
    ];
    for (const [name, data, ecl] of payloads) {
      it(name, () => {
        const qr = QrCode.encodeBinary(data, ecl);
        const { pixels, width } = render(qr);
        expect(jsQR(pixels, width, width)?.binaryData).toEqual(data);
      });
    }

    it("with every forced mask", () => {
      const data = bytes(40, 11);
      for (let mask = 0; mask < 8; mask++) {
        const { pixels, width } = render(QrCode.encodeBinary(data, Ecc.QUARTILE, 1, 40, mask));
        expect(jsQR(pixels, width, width)?.binaryData).toEqual(data);
      }
    });
  });

  describe("rejects what it can't encode", () => {
    it("data that doesn't fit the versions allowed", () => {
      expect(() => QrCode.encodeBinary(bytes(2954, 1), Ecc.LOW)).toThrow("Data too long");
      expect(() => QrCode.encodeBinary(bytes(20, 1), Ecc.MEDIUM, 1, 1)).toThrow("Data too long");
    });

    it("a value that isn't a byte", () => {
      expect(() => QrCode.encodeBinary([256], Ecc.LOW)).toThrow("Value out of range");
    });

    it("a version range or mask out of bounds", () => {
      expect(() => QrCode.encodeBinary([], Ecc.LOW, 0)).toThrow(RangeError);
      expect(() => QrCode.encodeBinary([], Ecc.LOW, 5, 4)).toThrow(RangeError);
      expect(() => QrCode.encodeBinary([], Ecc.LOW, 1, 41)).toThrow(RangeError);
      expect(() => QrCode.encodeBinary([], Ecc.LOW, 1, 40, 8)).toThrow(RangeError);
      expect(() => QrCode.encodeBinary([], Ecc.LOW, 1, 40, -2)).toThrow(RangeError);
    });

    it("low-level arguments that don't match", () => {
      expect(() => new QrCode(0, Ecc.LOW, [], 0)).toThrow("Version value out of range");
      expect(() => new QrCode(1, Ecc.LOW, Array(19).fill(0), 8)).toThrow("Mask value out of range");
      expect(() => new QrCode(1, Ecc.LOW, [1, 2, 3], 0)).toThrow("Invalid argument");
    });
  });

  it("reads coordinates outside the symbol as light", () => {
    const qr = QrCode.encodeBinary([1, 2, 3], Ecc.MEDIUM);
    expect(qr.getModule(0, 0)).toBe(true);
    expect([qr.getModule(-1, 0), qr.getModule(0, -1), qr.getModule(qr.size, 0)]).toEqual([
      false,
      false,
      false,
    ]);
    expect(qr.getModule(0, qr.size)).toBe(false);
  });
});

verifies("kit.qr-pairing-size", () => {
  it("keeps a payload of up to 150 bytes at ECC M within version 8", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const length of [16, 64, 120, 150]) {
        const qr = QrCode.encodeBinary([...pairingPrefix, ...bytes(length - 13, seed)], Ecc.MEDIUM);
        expect(qr.version).toBeLessThanOrEqual(8);
        expect(qr.size).toBeLessThanOrEqual(49);
      }
    }
  });

  it("still fits 152 bytes in version 8 and needs version 9 for 153", () => {
    expect(QrCode.encodeBinary(bytes(152, 3), Ecc.MEDIUM).version).toBe(8);
    expect(QrCode.encodeBinary(bytes(153, 3), Ecc.MEDIUM).version).toBe(9);
    expect(() => QrCode.encodeBinary(bytes(153, 3), Ecc.MEDIUM, 1, 8)).toThrow("Data too long");
  });
});
