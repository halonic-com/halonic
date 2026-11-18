// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import jsQRModule from "jsqr";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { QR_MODULE_PX, QrTile } from "./qr-tile.tsx";

// jsqr is CommonJS with `exports.default`; depending on the loader its default import is the
// function or the exports object.
type Decode = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { binaryData: number[] } | null;
const jsQR: Decode =
  typeof jsQRModule === "function"
    ? (jsQRModule as Decode)
    : (jsQRModule as unknown as { default: Decode }).default;

afterEach(() => {
  unmountAll();
});

/** The tile's SVG, drawn as an RGBA image at its own pixel size, the way a phone's camera sees it. */
function pixelsOf(svg: SVGSVGElement): { pixels: Uint8ClampedArray; width: number } {
  const width = Number(svg.getAttribute("width"));
  const modules = width / QR_MODULE_PX;
  const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
  const d = svg.querySelector("path")?.getAttribute("d") ?? "";
  for (const [, x, y] of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    const left = Number(x);
    const top = Number(y);
    expect(left).toBeLessThan(modules);
    expect(top).toBeLessThan(modules);
    for (let py = top * QR_MODULE_PX; py < (top + 1) * QR_MODULE_PX; py++) {
      const at = (py * width + left * QR_MODULE_PX) * 4;
      for (let px = 0; px < QR_MODULE_PX * 4; px += 4) pixels.fill(0, at + px, at + px + 3);
    }
  }
  return { pixels, width };
}

/** A 150-byte pairing payload: the prefix, then reproducible bytes. */
function pairingPayload(): Uint8Array {
  const prefix = new TextEncoder().encode("halonic-pair:");
  const payload = new Uint8Array(150);
  payload.set(prefix);
  for (let i = prefix.length; i < payload.length; i++) payload[i] = (i * 73 + 11) % 256;
  return payload;
}

const label = "QR code to pair your phone. Can't scan it? Type the pairing code below.";

verifies("kit.qr-tile", () => {
  it("draws a 150-byte payload at 4px a module with a 4-module quiet zone, and it decodes", () => {
    const payload = pairingPayload();
    const { container } = render(<QrTile value={payload} label={label} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    // Version 8 is 49 modules; with 4 quiet modules on each side, 57 modules of 4px.
    expect(svg.getAttribute("viewBox")).toBe("0 0 57 57");
    expect(svg.getAttribute("width")).toBe("228");
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    const { pixels, width } = pixelsOf(svg);
    expect(jsQR(pixels, width, width)?.binaryData).toEqual([...payload]);
  });

  it("keeps the quiet zone light: no dark module within 4 modules of the edge", () => {
    const { container } = render(<QrTile value="halonic-pair:AQ" label={label} />);
    const svg = container.querySelector("svg") as SVGSVGElement;
    const modules = Number(svg.getAttribute("width")) / QR_MODULE_PX;
    const d = svg.querySelector("path")?.getAttribute("d") ?? "";
    const places = [...d.matchAll(/M(\d+) (\d+)/g)].flatMap(([, x, y]) => [Number(x), Number(y)]);
    expect(places.length).toBeGreaterThan(0);
    expect(Math.min(...places)).toBe(4);
    expect(Math.max(...places)).toBe(modules - 5);
  });

  it("encodes text as UTF-8", () => {
    const { container } = render(<QrTile value="Tim's laptop · 14:02" label={label} />);
    const { pixels, width } = pixelsOf(container.querySelector("svg") as SVGSVGElement);
    expect(jsQR(pixels, width, width)?.binaryData).toEqual([
      ...new TextEncoder().encode("Tim's laptop · 14:02"),
    ]);
  });

  it("is black on a white tile of at least 232px in both themes, and one named image", () => {
    const { container } = render(<QrTile value="halonic-pair:AQ" label={label} />);
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.className).toContain("min-h-qr-tile min-w-qr-tile");
    expect(tile.className).toContain("bg-qr-light");
    expect(tile.className).toContain("forced-color-adjust-none");
    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(label);
    expect(svg.querySelector("rect")?.getAttribute("class")).toBe("fill-qr-light");
    expect(svg.querySelector("path")?.getAttribute("class")).toBe("fill-qr-dark");
  });

  it("throws a RangeError for a value too long for any QR Code", () => {
    expect(() => render(<QrTile value={new Uint8Array(2954)} label={label} />)).toThrow(RangeError);
  });
});
