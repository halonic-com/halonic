import { useMemo } from "react";
import { Ecc, QrCode } from "../qr/qr-code.ts";

/** The props of `QrTile`. */
export interface QrTileProps {
  /** What the code holds: text, sent as UTF-8, or bytes. The pairing payload is at most 150 bytes. */
  readonly value: string | Uint8Array;
  /**
   * The text alternative: what the code is for and the way round it, since a screen reader
   * can't scan. "QR code to pair your phone. Can't scan it? Type the pairing code below."
   */
  readonly label: string;
}

/** Each module is 4px, a whole number of pixels, so its edges stay sharp (Noah, HAL-12206). */
export const QR_MODULE_PX = 4;

/** The light modules round the symbol that a scanner needs to find its edge. */
export const QR_QUIET_MODULES = 4;

/**
 * A QR Code, black on a white tile in both themes: the pairing code a phone scans. The tile is
 * at least 232px; each module is 4px, with a 4-module quiet zone drawn into the image, so a
 * payload of up to 150 bytes (version 8 at ECC level M) fills 228px of it. Screen readers get
 * `label` as one image, which names the way round it.
 *
 * Throws a `RangeError` when `value` is too long for any QR Code.
 *
 * @example
 * <QrTile value={payload} label="QR code to pair your phone. Can't scan it? Type the pairing code below." />
 */
export function QrTile({ value, label }: QrTileProps) {
  const qr = useMemo(
    () =>
      QrCode.encodeBinary(
        typeof value === "string" ? new TextEncoder().encode(value) : value,
        Ecc.MEDIUM,
      ),
    [value],
  );
  const width = qr.size + QR_QUIET_MODULES * 2;
  return (
    <div className="inline-flex min-h-qr-tile min-w-qr-tile items-center justify-center rounded-md border border-border bg-qr-light p-0.5 forced-color-adjust-none">
      <svg
        role="img"
        aria-label={label}
        width={width * QR_MODULE_PX}
        height={width * QR_MODULE_PX}
        viewBox={`0 0 ${width} ${width}`}
        shapeRendering="crispEdges"
        className="block"
      >
        <rect width={width} height={width} className="fill-qr-light" />
        <path d={darkModules(qr)} className="fill-qr-dark" />
      </svg>
    </div>
  );
}

/** One path of 1×1 squares, one for each dark module, moved in by the quiet zone. */
function darkModules(qr: QrCode): string {
  const squares: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) {
        squares.push(`M${x + QR_QUIET_MODULES} ${y + QR_QUIET_MODULES}h1v1h-1z`);
      }
    }
  }
  return squares.join("");
}
