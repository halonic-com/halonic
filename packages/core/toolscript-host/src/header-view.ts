import type { ToolScriptArtifactHeader, ToolScriptData } from "@halonicjs/ports";

/**
 * The parts of a header the host reads beyond the port's fields. The
 * header was checked by `@halonicjs/toolscript` when it was built, but the
 * host still reads it defensively: a part of the wrong shape counts as
 * missing, never as a crash, and `touches` of the wrong shape refuses the
 * artifact (see {@link readHeader}).
 */
export interface HeaderView {
  /** The names of inputs marked `secret` (S7). */
  readonly secretInputs: readonly string[];
  /** `touches` by capability id, then argument field, then target template (S14); `undefined` when the header has none. */
  readonly touches: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  /** `ui.preview`, the header's reviewed preview blocks. */
  readonly preview: readonly ToolScriptData[];
}

/** Reads a header's secret inputs, `touches` and `ui.preview`; `undefined` for `touches` that aren't the documented shape. */
export function readHeader(header: ToolScriptArtifactHeader): HeaderView | undefined {
  const touches = readTouches(header["touches"]);
  if (touches === false) return undefined;
  return {
    secretInputs: readSecretInputs(header["inputs"]),
    touches,
    preview: readPreview(header["ui"]),
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSecretInputs(inputs: unknown): string[] {
  if (!isRecord(inputs)) return [];
  return Object.entries(inputs)
    .filter(([, field]) => isRecord(field) && field["secret"] === true)
    .map(([name]) => name);
}

/** `false` when `touches` is present but not a record of records of strings. */
function readTouches(touches: unknown): HeaderView["touches"] | false {
  if (touches === undefined) return undefined;
  if (!isRecord(touches)) return false;
  for (const targets of Object.values(touches)) {
    if (!isRecord(targets)) return false;
    if (!Object.values(targets).every((template) => typeof template === "string")) return false;
  }
  return touches as HeaderView["touches"];
}

function readPreview(ui: unknown): ToolScriptData[] {
  if (!isRecord(ui) || !Array.isArray(ui["preview"])) return [];
  return ui["preview"] as ToolScriptData[];
}
