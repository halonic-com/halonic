/**
 * The end-to-end session around the remote gateway protocol: the Noise
 * handshakes, the binary frames they travel in, the two cleartext refusals,
 * and the limits and times both sides keep (requirement
 * `ports.remote-gateway-session`, ADR "Pairing and the end-to-end session").
 * No crypto is done here: a Noise library does it behind an adapter.
 */

/** The Noise handshake that pairs a new phone, on the QR and the typed route alike. */
export const gatewayPairingPattern = "Noise_XXpsk3_25519_ChaChaPoly_SHA256";

/** The Noise handshake a paired phone reconnects with, to the host key it pinned. */
export const gatewayReconnectPattern = "Noise_IK_25519_ChaChaPoly_SHA256";

/**
 * The Noise prologue of both handshakes. It names the protocol version, so a
 * peer of another version fails the handshake instead of negotiating.
 */
export const gatewayNoisePrologue = "halonic-gateway/2";

/**
 * The first byte of every binary WebSocket frame, which says what follows.
 *
 * - `pair1` to `pair3` carry the three messages of the pairing handshake,
 *   `resume1` and `resume2` the two of the reconnect handshake.
 * - `message` carries one Noise transport message holding one gateway message.
 * - `rekey` carries an empty transport message, the sender's last under its
 *   old key: it rekeys its sending direction after it, and the reader rekeys
 *   its receiving direction after reading it.
 * - `handshake-failed` and `pair-refused` are the only cleartext frames. They
 *   are informative: anyone on the path could fake one, and neither may make
 *   the phone clear anything.
 *
 * Any other first byte, a frame of a kind the other side doesn't send, a
 * handshake frame out of order or a text frame closes the connection.
 */
export const gatewayFrameKinds = {
  pair1: 0x01,
  pair2: 0x02,
  pair3: 0x03,
  resume1: 0x11,
  resume2: 0x12,
  message: 0x20,
  rekey: 0x21,
  "handshake-failed": 0x30,
  "pair-refused": 0x31,
} as const;

/** One of the names in {@link gatewayFrameKinds}. */
export type GatewayFrameKind = keyof typeof gatewayFrameKinds;

/** The largest Noise message, handshake or transport, by the Noise spec. */
export const noiseMaxMessageBytes = 65_535;

/** The largest binary frame: a kind byte and one Noise message. */
export const gatewayMaxFrameBytes = 1 + noiseMaxMessageBytes;

/**
 * The largest handshake message, without its kind byte. The longest, pairing
 * message 3, is 32 + 16 bytes of key and tag and a payload with a name of at
 * most {@link gatewayMaxNameBytes}, so a larger one is an attack.
 */
export const gatewayMaxHandshakeBytes = 1_024;

/** The longest name in a handshake payload, the host's or the phone's, in bytes of UTF-8. */
export const gatewayMaxNameBytes = 64;

/**
 * The payload of pairing message 2, from the host, encrypted: the name the
 * phone shows for it. JSON, UTF-8.
 */
export interface PairHostPayload {
  readonly hostName: string;
}

/**
 * The payload of pairing message 3, from the phone, encrypted: the name and
 * platform the host shows with the check code and keeps for the phone. JSON,
 * UTF-8. The reconnect handshake's payloads are empty.
 */
export interface PairPhonePayload {
  readonly name: string;
  readonly platform: "android" | "ios";
}

/**
 * The session's times and counts. A handshake not finished
 * `handshakeTimeoutMs` after its first frame is closed. A sender sends a
 * `rekey` frame at the latest `rekeyAfterMs` after its last one, or as its
 * `rekeyAfterMessages`-th transport message since, whichever comes first; a
 * reader closes the connection when one more message arrives without it. The
 * host ends a session `sessionMaxMs` after its handshake, and the phone
 * reconnects with IK.
 */
export const gatewaySessionLimits = {
  handshakeTimeoutMs: 10_000,
  rekeyAfterMs: 30 * 60_000,
  rekeyAfterMessages: 10_000,
  sessionMaxMs: 24 * 60 * 60_000,
} as const;

/**
 * The host's pairing rules, kept in memory only (build plan decision 6). A
 * code lives `codeLifetimeMs` and pairs at most one phone: the first pairing
 * message 3 that decrypts with it uses it up. The host then waits
 * `allowWaitMs` for Allow. A message 3 that doesn't decrypt is a wrong try;
 * `wrongTriesPerCode` of them end the code, and the host takes at most
 * `failedTriesPerMinute` failed tries across all codes before it refuses
 * pairing message 1 until the minute is over.
 */
export const pairingRules = {
  codeLifetimeMs: 5 * 60_000,
  allowWaitMs: 2 * 60_000,
  wrongTriesPerCode: 5,
  failedTriesPerMinute: 10,
} as const;

/**
 * Why the host refused a pairing before the phone's message 3 decrypted, in
 * the order of the byte that encodes each.
 *
 * - `wrong-code`: message 3 didn't decrypt; `triesLeft` is 1 to 4.
 * - `code-ended`: the code ran out, had its last wrong try, or its dialog was
 *   closed, or no pairing is open.
 * - `code-used`: another phone's message 3 already used the code.
 * - `rate-limited`: the host has had too many failed tries this minute.
 */
export const pairRefusedReasons = [
  "wrong-code",
  "code-ended",
  "code-used",
  "rate-limited",
] as const;

/** One of {@link pairRefusedReasons}. */
export type PairRefusedReason = (typeof pairRefusedReasons)[number];

/**
 * A cleartext frame. `triesLeft` is 0 for every reason but `wrong-code`.
 * After either one the host closes the connection.
 */
export type GatewayCleartextFrame =
  | { readonly kind: "handshake-failed" }
  | {
      readonly kind: "pair-refused";
      readonly reason: PairRefusedReason;
      readonly triesLeft: number;
    };

/**
 * Writes a cleartext frame: one kind byte, and for `pair-refused` the index of
 * its reason in {@link pairRefusedReasons} and `triesLeft`. Throws a
 * `RangeError` for a `triesLeft` the rules don't allow.
 */
export function encodeCleartextFrame(frame: GatewayCleartextFrame): Uint8Array {
  if (frame.kind === "handshake-failed") {
    return Uint8Array.of(gatewayFrameKinds["handshake-failed"]);
  }
  const most = frame.reason === "wrong-code" ? pairingRules.wrongTriesPerCode - 1 : 0;
  const least = frame.reason === "wrong-code" ? 1 : 0;
  if (!Number.isInteger(frame.triesLeft) || frame.triesLeft < least || frame.triesLeft > most) {
    throw new RangeError(`triesLeft for ${frame.reason} must be ${least} to ${most}`);
  }
  return Uint8Array.of(
    gatewayFrameKinds["pair-refused"],
    pairRefusedReasons.indexOf(frame.reason),
    frame.triesLeft,
  );
}

/**
 * Reads a cleartext frame, exactly as {@link encodeCleartextFrame} writes it.
 * Anything else, including a reason or a `triesLeft` it would refuse to
 * write, is `undefined`: the phone treats it as bytes it can't read.
 */
export function decodeCleartextFrame(bytes: Uint8Array): GatewayCleartextFrame | undefined {
  const [kind, reasonByte, triesLeft] = bytes;
  if (kind === gatewayFrameKinds["handshake-failed"] && bytes.length === 1) {
    return { kind: "handshake-failed" };
  }
  if (kind !== gatewayFrameKinds["pair-refused"] || bytes.length !== 3) return undefined;
  const reason = pairRefusedReasons[reasonByte as number];
  if (reason === undefined || triesLeft === undefined) return undefined;
  const frame: GatewayCleartextFrame = { kind: "pair-refused", reason, triesLeft };
  try {
    encodeCleartextFrame(frame);
  } catch {
    return undefined;
  }
  return frame;
}
