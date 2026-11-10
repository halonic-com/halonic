import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * The connect protocol's messages, written once. The spec files in
 * `src-tauri/crates/connect/spec/` are generated from these schemas, and the
 * shared fixtures next to them are checked against both sides: this file for
 * TypeScript, and the Rust crate `halonic-connect` for Rust.
 */

/** A version as the Rust crate reads it: `0.1.0`, `0.1.0-beta.1`, build metadata allowed. */
const VERSION_PATTERN = [
  "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)",
  // Pre-release identifiers: a number without a leading zero, or a word.
  "(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?",
  "(\\+[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$",
].join("");

const version = (): ReturnType<typeof s.string> => s.string().regex(new RegExp(VERSION_PATTERN));

/**
 * The computer's answer to `GET /api/hello` (computer to app). Other keys are
 * allowed, so the computer can add some later.
 */
export const helloAnswerSchema = s
  .object({
    product: s.literal("halonic"),
    version: version(),
    minAppVersion: version(),
  })
  .passthrough();

/** One outcome of a Connect press (shell to connect page). */
export const connectResultSchema = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("connected"), url: s.string() }).strict(),
  s.object({ kind: s.literal("notAnAddress") }).strict(),
  s.object({ kind: s.literal("notHomeNetwork") }).strict(),
  s.object({ kind: s.literal("notAnswering"), address: s.string() }).strict(),
  s.object({ kind: s.literal("notHalonic"), address: s.string() }).strict(),
  s.object({ kind: s.literal("appTooOld"), computerVersion: s.string() }).strict(),
  s.object({ kind: s.literal("computerTooOld"), computerVersion: s.string() }).strict(),
]);

export type HelloAnswer = Infer<typeof helloAnswerSchema>;
export type ConnectResult = Infer<typeof connectResultSchema>;
