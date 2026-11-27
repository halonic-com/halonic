import {
  type ToolScriptCallContext,
  type ToolScriptData,
  type ToolScriptLimits,
  type ToolScriptReason,
  toolScriptReasons,
} from "./tool-script-host.ts";

/** Version of the {@link ToolScriptIsolate} port. A breaking change bumps it and comes with an ADR. */
export const toolScriptIsolateVersion = 1;

/**
 * Marks a {@link ToolScriptSecretHandle}. A registered symbol, so that copies
 * of this package agree on it, and no plain data can carry it.
 */
export const toolScriptSecretHandleMark: unique symbol = Symbol.for(
  "halonic.toolscript.secret-handle",
);

/**
 * A secret a host function gives the script by reference only (ADR S7). The
 * isolate never copies it in: the script gets a random id made for this run,
 * and the isolate turns that id back into this same object when the script
 * passes it to a host function. `reference` is the host's own, such as the
 * secret's name in a store, and never enters the isolate.
 */
export interface ToolScriptSecretHandle {
  readonly [toolScriptSecretHandleMark]: true;
  readonly reference: string;
}

/** Makes a frozen {@link ToolScriptSecretHandle} for `reference`. */
export function toolScriptSecretHandle(reference: string): ToolScriptSecretHandle {
  return Object.freeze({ [toolScriptSecretHandleMark]: true as const, reference });
}

/**
 * Whether `value` is a {@link ToolScriptSecretHandle}. Check with this, not
 * by shape: it reads the registered mark, which data never has.
 */
export function isToolScriptSecretHandle(value: unknown): value is ToolScriptSecretHandle {
  if (typeof value !== "object" || value === null) return false;
  const handle = value as Partial<ToolScriptSecretHandle>;
  return handle[toolScriptSecretHandleMark] === true && typeof handle.reference === "string";
}

/** Plain data that may also hold secret handles: what host functions and the isolate pass each other. */
export type ToolScriptIsolateValue =
  | ToolScriptData
  | ToolScriptSecretHandle
  | readonly ToolScriptIsolateValue[]
  | { readonly [key: string]: ToolScriptIsolateValue };

/**
 * A function the host puts on `ctx`. It runs outside the isolate and gets a
 * plain-data copy of the script's argument (S15), with every handle id
 * turned back into its handle. To stop the run with a listed reason, such as
 * `toolscript.declined`, it rejects with a {@link ToolScriptStop}.
 */
export type ToolScriptIsolateFunction = (
  args: ToolScriptIsolateValue,
  context: ToolScriptCallContext,
) => Promise<ToolScriptIsolateValue>;

/**
 * `ctx`'s host functions: `ctx.<name>` for a function, `ctx.<namespace>.<method>`
 * for a namespace. `input` and `log` are the isolate's own and can't be named.
 */
export type ToolScriptIsolateFunctions = Readonly<
  Record<string, ToolScriptIsolateFunction | Readonly<Record<string, ToolScriptIsolateFunction>>>
>;

/** One run in a fresh isolate. The caller has already checked the artifact (hash, audience, `uses`). */
export interface ToolScriptIsolateRequest {
  /** Unique per run; the run's handle ids are bound to it (S7). */
  readonly runId: string;
  /** The artifact's stripped JavaScript: an ES module that exports `run(ctx)`. */
  readonly code: string;
  /** `ctx.input`, copied in as frozen data; handles in it reach the script as ids. */
  readonly input: ToolScriptIsolateValue;
  readonly functions: ToolScriptIsolateFunctions;
  /** The run's limits, already worked out with `effectiveToolScriptLimits`. */
  readonly limits: ToolScriptLimits;
  readonly signal?: AbortSignal;
}

/** What every isolate run reports, whatever its outcome. */
export interface ToolScriptIsolateTrace {
  /** `ctx.log` lines, each cut to `logLineCharacters`: untrusted text from the script (S11). */
  readonly log: readonly string[];
  /** The limits the isolate really applied, such as a platform's 128 MB memory. */
  readonly limits: ToolScriptLimits;
}

/** An isolate run's outcome. A failure carries a listed reason and at most a short message, never a stack (S13). */
export type ToolScriptIsolateResult =
  | (ToolScriptIsolateTrace & { readonly ok: true; readonly output: ToolScriptData })
  | (ToolScriptIsolateTrace & {
      readonly ok: false;
      readonly reason: ToolScriptReason;
      readonly message?: string;
    });

/**
 * What a host function rejects with to stop the run with a listed reason.
 * Check for it with {@link isToolScriptStop}, not `instanceof`: an adapter
 * may be built against its own copy of this package.
 *
 * @example
 * if (!(await confirm(writes))) throw new ToolScriptStop("toolscript.declined");
 */
export class ToolScriptStop extends Error {
  override readonly name = "ToolScriptStop";
  readonly reason: ToolScriptReason;

  /**
   * @param reason - why the run stops
   * @param message - safe to show and to record; at most `toolScriptMessageCharacters` are kept
   */
  constructor(reason: ToolScriptReason, message?: string) {
    super(message ?? reason);
    this.reason = reason;
  }
}

/** Whether `value` is a {@link ToolScriptStop}: an `Error` named "ToolScriptStop" with a listed reason. */
export function isToolScriptStop(value: unknown): value is ToolScriptStop {
  if (!(value instanceof Error) || value.name !== "ToolScriptStop") return false;
  const reason: unknown = (value as Partial<ToolScriptStop>).reason;
  return (toolScriptReasons as readonly unknown[]).includes(reason);
}

/**
 * Runs one ToolScript in a fresh isolate (ADR "Halonic ToolScript" 2;
 * requirement `ports.tool-script-isolate`). The `ctx` host
 * (`core/toolscript-host`) builds on it; QuickJS and the Cloudflare Dynamic
 * Worker implement it, and every implementation passes the same fence suite.
 *
 * Each run gets a new isolate with no state from an earlier run, and
 * `ctx` holds only `input`, `log`, `fail` and the given functions, frozen;
 * `ctx.fail(message)` ends the run at once with `toolscript.failed`, awaited
 * or not, so no given function may be named `fail`. `run`
 * rejects only for request limits that `effectiveToolScriptLimits` refuses,
 * the caller's own bug. Otherwise a thrown script error is
 * `toolscript.script-error`, a tripped limit
 * its `limit.*` code, an argument that isn't plain data
 * `toolscript.bad-argument`, an unknown handle id `toolscript.bad-handle`, a
 * {@link ToolScriptStop} its reason, and any other rejection of a host
 * function `toolscript.capability-failed`, without its message. Time spent
 * waiting on a host function doesn't count as CPU. Once the run ends, no
 * host function is called again and no pending result reaches the isolate.
 *
 * @example
 * const result = await isolate.run({ runId, code: artifact.code, input, functions, limits });
 * if (!result.ok) record.fail(result.reason);
 */
export interface ToolScriptIsolate {
  /** The most this isolate can give; a run gets at most these, whatever it asks for. */
  readonly limits: ToolScriptLimits;
  run(request: ToolScriptIsolateRequest): Promise<ToolScriptIsolateResult>;
}
