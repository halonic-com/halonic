/**
 * The agent host's end of the end-to-end session: Noise from `snow` built to
 * WebAssembly, and the hashes around the pairing handshake. The gateway (B3)
 * and the pairing service (B2) use it; nothing else should.
 */

export type { NoiseHandshake, NoiseRole, NoiseSessionOptions } from "./noise-session.ts";
export { NoiseSession, NoiseSessionError } from "./noise-session.ts";
export { checkCode, pairCommit, pairingPsk, sameBytes } from "./pairing-crypto.ts";
