import type {
  ToolScriptCallContext,
  ToolScriptCapability,
  ToolScriptData,
  ToolScriptSecretHandle,
  ToolScriptWrite,
} from "@halonicjs/ports";

/**
 * A capability with what the host needs beyond the port's
 * {@link ToolScriptCapability}. Every extra is optional, so a plain port
 * capability still runs: it just takes no secret, checks no schema and adds
 * no preview lines.
 */
export interface ToolScriptHostCapability extends ToolScriptCapability {
  /**
   * The top-level argument fields that may hold a secret handle (S7). A
   * handle anywhere else is refused with `toolscript.bad-handle`. In these
   * fields the capability gets the {@link ToolScriptSecretHandle} itself, and
   * reads its value with {@link ToolScriptHostCallContext.secret}.
   */
  readonly secretFields?: readonly string[];
  /** The capability's own input schema (S16): `false` refuses the call with `toolscript.bad-argument`. */
  readonly acceptsArguments?: (args: ToolScriptData) => boolean;
  /**
   * The capability's own preview lines for a write, from the frozen arguments
   * (S17). The host always adds them after the header's preview, so a
   * script's wording can never hide what the capability will do. Secret
   * fields hold the handle itself (check with `isToolScriptSecretHandle`),
   * never its value.
   */
  readonly preview?: (args: ToolScriptData) => readonly string[];
}

/** What a {@link ToolScriptHostCapability} gets for a call, besides its arguments. */
export interface ToolScriptHostCallContext extends ToolScriptCallContext {
  /**
   * The value behind a secret handle of this run, or `undefined` for a
   * handle of another run or after the run has ended (S7).
   */
  secret(handle: ToolScriptSecretHandle): string | undefined;
}

/** A write's preview: the header's reviewed blocks, then the capability's own lines (S17). */
export interface ToolScriptPreview {
  /** The header's `ui.preview` blocks, as written in the reviewed header. */
  readonly fromHeader: readonly ToolScriptData[];
  /** The capability's own lines, from the frozen arguments. */
  readonly fromCapability: readonly string[];
}

/**
 * A write as this host hands it to `confirm`: the port's
 * {@link ToolScriptWrite}, whose `args` are the very frozen object that will
 * be sent, secret handles included (a handle holds no value), plus the
 * preview when the header or the capability gives one.
 */
export interface ToolScriptHostWrite extends ToolScriptWrite {
  /** For each top-level field that holds a secret handle, the input it stands for. */
  readonly secretInputs?: Readonly<Record<string, string>>;
  readonly preview?: ToolScriptPreview;
}
