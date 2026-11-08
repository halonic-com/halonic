import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * The recording file: `integrations/<name>/recordings/<scenario>.json`.
 *
 * This is the one contract shared by the recorder and the conformance suite,
 * which both read recordings with `recordingFileSchema`. It is carried over
 * from `tooling/record/src/format.ts` in halonic-com/integrations (155685c)
 * with Zod's builders swapped for schema-kit's. It imports only schema-kit,
 * never `yaml`, so a reader of recordings doesn't load the YAML parser. A
 * change here needs the same change in the suite's reader, or a new
 * `RECORDING_FORMAT`.
 */

/** Bumped when the file layout changes in a way old readers can't handle. */
export const RECORDING_FORMAT = "halonic.recording/1";

/** Header names in lower case. Headers that change on every run are left out. */
const headersSchema = s.record(s.string().regex(/^[a-z0-9!#$%&'*+.^_`|~-]+$/), s.string());

const streamEventSchema = s
  .object({
    event: s.string(),
    data: s.json(),
  })
  .strict();

/**
 * A body, saved parsed. Anything that isn't one of these kinds was refused
 * when it was recorded. `text` only appears when the integration allows its
 * content type.
 */
const bodySchema = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("empty") }).strict(),
  s.object({ kind: s.literal("json"), value: s.json() }).strict(),
  s.object({ kind: s.literal("form"), value: s.array(s.tuple([s.string(), s.string()])) }).strict(),
  s.object({ kind: s.literal("text"), contentType: s.string(), value: s.string() }).strict(),
  s.object({ kind: s.literal("sse"), value: s.array(streamEventSchema) }).strict(),
]);

const httpExchangeSchema = s
  .object({
    transport: s.literal("http"),
    request: s
      .object({
        method: s.string().regex(/^[A-Z]+$/),
        url: s.url(),
        headers: headersSchema,
        body: bodySchema,
      })
      .strict(),
    response: s
      .object({
        status: s.number().int().min(100).max(599),
        headers: headersSchema,
        body: bodySchema,
      })
      .strict(),
  })
  .strict();

/**
 * One exchange, tagged by transport. Only `http` today; local MCP programs
 * will add `stdio` (ordered JSON-RPC messages) without a new format version.
 */
const exchangeSchema = s.discriminatedUnion("transport", [httpExchangeSchema]);

/** What the scrubber replaced: the rule, the place and how often. Never a value. */
const reportEntrySchema = s
  .object({
    rule: s.string(),
    path: s.string(),
    count: s.number().int().positive(),
  })
  .strict();

export const recordingFileSchema = s
  .object({
    format: s.literal(RECORDING_FORMAT),
    integration: s.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    scenario: s.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    /** In call order: on replay, each call is matched by method, URL and position. */
    exchanges: s.array(exchangeSchema),
    scrubReport: s.array(reportEntrySchema),
  })
  .strict();

export type RecordingFile = Infer<typeof recordingFileSchema>;

/**
 * The exact text of a recording file: keys sorted at every level, indented
 * by 2, with a final line break, so the same recording always gives the same
 * text and diffs stay easy to review. Lists keep their order.
 */
export function formatRecording(file: RecordingFile): string {
  return `${JSON.stringify(sortKeys(file), null, 2)}\n`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => byStringOrder(a, b));
    return Object.fromEntries(entries.map(([key, child]) => [key, sortKeys(child)]));
  }
  return value;
}

/** Plain string order, the same on every machine (unlike `localeCompare`). */
function byStringOrder(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
