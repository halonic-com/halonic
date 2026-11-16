import { errorMessageFor } from "@halonicjs/studio-shell";

/**
 * The sentence a failed first read gives the user: a system message never reaches them, so an
 * `internal` error or an empty message gives `undefined` (the page then says the engine isn't
 * answering).
 */
export function readFailureReason(error: unknown, title: string): string | undefined {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}
