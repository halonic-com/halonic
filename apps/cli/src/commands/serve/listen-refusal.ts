// Why `serve` couldn't start listening, as the CLI says it: an error of a kind, with the
// runtime's own sentence when that already says what to do.

import { KindedError } from "@halonicjs/std";
import {
  NetworkNeedsPasswordError,
  NoNetworkAddressError,
  PublicOriginNeedsPasswordError,
} from "@halonicjs/target-node-runtime";
import { plainText } from "../../messages/phrase.ts";
import { serveMessages } from "../../messages/serve.ts";

/**
 * Turns a failure to listen on `port` into the error `serve` stops with.
 *
 * @throws KindedError `invalid_input` when the network or a public origin needs a password
 * @throws KindedError `unavailable` when the computer has no network address
 * @throws KindedError `conflict` when another program has the port
 * @throws the error itself for anything else
 */
export function listenRefused(error: unknown, port: number): never {
  // The runtime's own sentences say what to do, so they reach the person as they are.
  if (
    error instanceof NetworkNeedsPasswordError ||
    error instanceof PublicOriginNeedsPasswordError
  ) {
    throw new KindedError("invalid_input", error.message, { cause: error });
  }
  if (error instanceof NoNetworkAddressError) {
    throw new KindedError("unavailable", error.message, { cause: error });
  }
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    const other = port === 65535 ? port - 1 : port + 1;
    const message = serveMessages.portInUse(port, other);
    throw new KindedError("conflict", plainText(message.phrase), { cause: error });
  }
  throw error;
}
