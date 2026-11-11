// The frames that cross the runner's stdin and stdout (design HAL-958,
// section 3.2). Halonic checks every frame the runner sends against these
// shapes and stops the runner on anything else, so the shapes are strict:
// unknown keys and unknown types are refused, not dropped.

import type { Integration } from "@halonicjs/ports";
import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * The largest frame, in bytes, including its newline: 1 MiB. Halonic stops
 * the runner on a longer one, and neither side ever writes one.
 */
export const maxFrameBytes = 1_048_576;

/** A call, request or ping number: a whole number that JSON carries exactly. */
const frameId = s.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Headers as name and value pairs, in order, so repeated names survive. */
const headerList = s.array(s.tuple([s.string(), s.string()]));

/** A secret placement, by the secret's name: never its value. */
const secretPlacement = s.discriminatedUnion("as", [
  s.object({ secret: s.string(), as: s.literal("bearer") }).strict(),
  s
    .object({
      secret: s.string(),
      as: s.literal("header"),
      header: s.string(),
      prefix: s.string().optional(),
    })
    .strict(),
  s.object({ secret: s.string(), as: s.literal("form"), field: s.string() }).strict(),
]);

/**
 * A request body as it crosses: text, a form (sent as its encoded text, so
 * the kit can still place a secret in a form field) or bytes as base64.
 */
const requestBody = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("text"), text: s.string() }).strict(),
  s.object({ kind: s.literal("form"), text: s.string() }).strict(),
  s.object({ kind: s.literal("bytes"), base64: s.string() }).strict(),
]);

/** A request body as it crosses the bridge. */
export type FrameBody = Infer<typeof requestBody>;

/**
 * Why a request or a body read failed: the kit's refusal code or one of the
 * bridge's own (`request-errors.ts`). Halonic writes it, so the runner takes
 * any short code and turns an unknown one into a refusal.
 */
const errorCode = s.string().min(1).max(64);

/**
 * One tool as the integration's code declares it. Halonic checks it against
 * the permission sheet before the first call, so a tool that differs from
 * what the user approved is never offered.
 */
const declaredTool = s
  .object({
    name: s.string(),
    description: s.string(),
    parameters: s.record(s.string(), s.unknown()),
    risk: s.enum(["read", "write", "send"]),
    untrusted: s.boolean().optional(),
  })
  .strict();

/** Every frame the runner sends to Halonic. */
export const runnerFrame = s.discriminatedUnion("type", [
  s.object({ type: s.literal("ready"), nonce: s.string() }).strict(),
  s
    .object({
      type: s.literal("declared"),
      name: s.string(),
      version: s.string(),
      tools: s.array(declaredTool),
    })
    .strict(),
  s.object({ type: s.literal("pong"), n: frameId }).strict(),
  s
    .object({
      type: s.literal("result"),
      call: frameId,
      text: s.string().optional(),
      error: s.string().optional(),
    })
    .strict()
    .refine((frame) => (frame.text === undefined) !== (frame.error === undefined), {
      message: "a result has either text or an error",
    }),
  s
    .object({
      type: s.literal("fetch"),
      id: frameId,
      call: frameId,
      url: s.string(),
      method: s.string().min(1).max(32),
      headers: headerList,
      body: requestBody.nullable(),
      auth: s.array(secretPlacement),
    })
    .strict(),
  s.object({ type: s.literal("pull"), body: frameId }).strict(),
  s.object({ type: s.literal("cancel-body"), body: frameId }).strict(),
  s.object({ type: s.literal("abort"), id: frameId }).strict(),
]);

/** A frame the runner sends to Halonic. */
export type RunnerFrame = Infer<typeof runnerFrame>;

/** Every frame Halonic sends to the runner. */
export const halonicFrame = s.discriminatedUnion("type", [
  s
    .object({
      type: s.literal("start"),
      settings: s.record(s.string(), s.unknown()),
      tools: s.array(s.string()),
    })
    .strict(),
  s
    .object({
      type: s.literal("call"),
      call: frameId,
      name: s.string(),
      args: s.record(s.string(), s.unknown()),
    })
    .strict(),
  s.object({ type: s.literal("cancel"), call: frameId }).strict(),
  s.object({ type: s.literal("ping"), n: frameId }).strict(),
  s
    .object({
      type: s.literal("head"),
      id: frameId,
      status: s.number().int().min(200).max(599),
      statusText: s.string(),
      headers: headerList,
      url: s.string(),
      hasBody: s.boolean(),
    })
    .strict(),
  s
    .object({ type: s.literal("error"), id: frameId, code: errorCode, message: s.string() })
    .strict(),
  s.object({ type: s.literal("chunk"), id: frameId, base64: s.string() }).strict(),
  s.object({ type: s.literal("end"), id: frameId }).strict(),
]);

/** A frame Halonic sends to the runner. */
export type HalonicFrame = Infer<typeof halonicFrame>;

/** The `error` frame Halonic sends for a request or a body read. */
export type ErrorFrame = Extract<HalonicFrame, { type: "error" }>;

/**
 * What the integration's code says it is, as the runner sends it after
 * `start`: its name, its version and its tools.
 */
export type IntegrationDeclaration = Pick<Integration, "name" | "version" | "tools">;

/** The `declared` frame the runner sends. */
export type DeclaredFrame = Extract<RunnerFrame, { type: "declared" }>;

/** The `fetch` frame the runner sends. */
export type FetchFrame = Extract<RunnerFrame, { type: "fetch" }>;
