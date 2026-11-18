import { QrTile } from "../../src/qr-tile/qr-tile.tsx";
import type { PartSection } from "../state-table.tsx";

/** The base64url symbols, for a sample payload. */
const base64url = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A sample pairing payload of 150 bytes, the most a pairing QR holds: version 8 at ECC M. */
const payload = `halonic-pair:${Array.from({ length: 137 }, (_, i) => base64url.charAt((i * 37) % 64)).join("")}`;

export const qrTileSection: PartSection = {
  id: "qr-tile",
  number: "26.5",
  name: "QrTile",
  order: "tunnel phase B · a 150-byte pairing payload: white in both themes, 4px modules",
  notApplicable: "hover, focus, disabled, error (shown, not interactive)",
  rows: [
    {
      name: "Default",
      copies: () => (
        <QrTile
          value={payload}
          label="QR code to pair your phone. Can't scan it? Type the pairing code below."
        />
      ),
    },
  ],
};
