import { errorMessageFor } from "@halonicjs/studio-shell";

/**
 * The sentence a failed first read gives the user: a system message never reaches them, so an
 * `internal` error or an empty message gives `undefined` (the page then says the engine isn't
 * answering).
 */
export function readFailureReason(
  error: unknown,
  title: string,
  item?: { readonly kindName: string },
): string | undefined {
  // A missing item is the shared "This skill isn't in this workspace any more." (microcopy 11.3), not the engine's own sentence.
  const message = errorMessageFor(error, {
    title,
    ...(item === undefined ? {} : { item: { ...item, place: "Library" } }),
  });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}
