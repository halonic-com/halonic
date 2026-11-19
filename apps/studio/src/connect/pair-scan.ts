import { decodePairingQr, type PairingQrPayload } from "@halonicjs/ports";
import { type Infer, parse, s } from "@halonicjs/schema-kit";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * What the shell's `pair_scan` command answers (`halonic_connect::ScanAnswer`
 * in `src-tauri/crates/connect/src/pair_scan.rs`). The shell hands on only a
 * QR code whose text starts with `halonic-pair:`, at most 150 bytes long.
 */
export const scanAnswerSchema = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("scanned"), text: s.string() }).strict(),
  s.object({ kind: s.literal("notAPairingCode") }).strict(),
  s.object({ kind: s.literal("closed") }).strict(),
  s.object({ kind: s.literal("noCamera"), askAgain: s.boolean() }).strict(),
  s.object({ kind: s.literal("noScanner") }).strict(),
]);

export type ScanAnswer = Infer<typeof scanAnswerSchema>;

/**
 * One outcome of the pairing scanner, for the phone's pairing screens.
 *
 * - `pairingCode`: the computer's key, the pairing code, its name and where
 *   to reach it, ready for the pairing handshake.
 * - `notAPairingCode`: another code, or a pairing code this app can't read,
 *   such as one of a newer version.
 * - `closed`: the scanner closed without a code.
 * - `noCamera`: the camera is turned down; `askAgain` says whether Android
 *   will ask on the next try.
 * - `noScanner`: this build has no scanner.
 */
export type PairingScan =
  | { readonly kind: "pairingCode"; readonly payload: PairingQrPayload }
  | { readonly kind: "notAPairingCode" }
  | { readonly kind: "closed" }
  | { readonly kind: "noCamera"; readonly askAgain: boolean }
  | { readonly kind: "noScanner" };

/** The phone's pairing scanner. */
export interface PairingScanner {
  /**
   * Opens the camera behind the page and waits for one code. The page
   * shows the scanner screen over the camera, with a way to close it.
   */
  scan(): Promise<PairingScan>;
  /** Closes the camera. A waiting {@link scan} gives `closed`. */
  close(): Promise<void>;
}

/**
 * The scanner for the real app: each call goes to the shell, which drives
 * the camera. The capability grants `pair_scan` and `pair_scan_cancel` to
 * the phone's own page only.
 */
export function tauriPairingScanner(internals: TauriIpc): PairingScanner {
  return {
    scan: async () => readPairingScan(await internals.invoke("pair_scan")),
    close: async () => {
      await internals.invoke("pair_scan_cancel");
    },
  };
}

/**
 * Reads the shell's answer. A scanned text is only ever decoded with
 * `decodePairingQr`, which refuses an unknown version: nothing is opened,
 * fetched or looked up from it. An answer the page doesn't know reads as
 * `closed`.
 */
export function readPairingScan(answer: unknown): PairingScan {
  const parsed = parse(scanAnswerSchema, answer);
  if (!parsed.ok) return { kind: "closed" };
  const known = parsed.value;
  if (known.kind !== "scanned") return known;
  const payload = decodePairingQr(known.text);
  return payload === undefined ? { kind: "notAPairingCode" } : { kind: "pairingCode", payload };
}
