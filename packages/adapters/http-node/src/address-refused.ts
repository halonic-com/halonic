/**
 * Thrown when a request would reach an address its host may not reach: a
 * host with no class, an answer with no allowed address, or one of
 * Halonic's own ports on this computer. Nothing was sent.
 */
export class AddressRefusedError extends Error {
  /** A stable code, so a caller can tell this refusal from a network failure. */
  readonly code = "address-not-allowed";

  constructor(message: string) {
    super(message);
    this.name = "AddressRefusedError";
  }
}
