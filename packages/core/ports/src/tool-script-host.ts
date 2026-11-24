/** Version of the {@link ToolScriptHost} port. A breaking change bumps it and comes with an ADR. */
export const toolScriptHostVersion = 1;

/**
 * Who a ToolScript runs for. A `user` script runs only in Studio desktop with
 * the person's own sign-in; an `agent` script runs only in the engine or the
 * Paperclip plugin with the agent's permissions (ADR "Halonic ToolScript", S4).
 */
export const toolScriptAudiences = ["user", "agent"] as const;

/** One of {@link toolScriptAudiences}. */
export type ToolScriptAudience = (typeof toolScriptAudiences)[number];

/**
 * Why a run stopped without an output. The list is fixed: hosts map their own
 * errors onto it, records keep only the code (S13), and Studio words each
 * code. `limit.*` codes name the limit that tripped (ADR 2.3).
 */
export const toolScriptReasons = [
  "limit.cpu",
  "limit.memory",
  "limit.stack",
  "limit.wall-clock",
  "limit.calls",
  "limit.input",
  "limit.output",
  "limit.log",
  "limit.promises",
  "toolscript.wrong-audience",
  "toolscript.bad-artifact",
  "toolscript.code-hash-mismatch",
  "toolscript.unpinned",
  "toolscript.unknown-capability",
  "toolscript.bad-input",
  "toolscript.bad-argument",
  "toolscript.bad-output",
  "toolscript.bad-handle",
  "toolscript.undeclared-target",
  "toolscript.irreversible-in-batch",
  "toolscript.no-network",
  "toolscript.declined",
  "toolscript.capability-failed",
  "toolscript.failed",
  "toolscript.script-error",
  "toolscript.cancelled",
] as const;

/** One of {@link toolScriptReasons}. */
export type ToolScriptReason = (typeof toolScriptReasons)[number];

/** The longest message a failed run carries, in characters (S11, S13). */
export const toolScriptMessageCharacters = 300;

/**
 * Data that crosses the isolate's edge: inputs, `ctx` arguments, results and
 * the output. Only plain values; a host copies it out of the isolate itself
 * and refuses anything else (S15).
 */
export type ToolScriptData =
  | null
  | boolean
  | number
  | string
  | readonly ToolScriptData[]
  | { readonly [key: string]: ToolScriptData };

/** A run's limits (ADR 2.3). A header or a request may only lower them. */
export interface ToolScriptLimits {
  readonly memoryBytes: number;
  readonly stackBytes: number;
  /** CPU time inside the isolate; waiting on `ctx` or the person doesn't count. */
  readonly cpuMs: number;
  /** `null`: no wall-clock limit (a user script runs while its stepper is open). */
  readonly wallClockMs: number | null;
  readonly calls: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly logLines: number;
  /** A longer log line is cut to this length; it doesn't stop the run. */
  readonly logLineCharacters: number;
  /** Size of one `ctx` call's arguments as JSON, after the plain-data copy. */
  readonly argumentBytes: number;
  readonly argumentDepth: number;
  readonly argumentItems: number;
  readonly pendingPromises: number;
}

const sharedLimits = {
  memoryBytes: 32 * 1024 * 1024,
  stackBytes: 256 * 1024,
  cpuMs: 2_000,
  inputBytes: 16 * 1024,
  outputBytes: 64 * 1024,
  logLines: 200,
  logLineCharacters: 300,
  argumentBytes: 8 * 1024,
  argumentDepth: 8,
  argumentItems: 100,
  pendingPromises: 32,
} as const;

/** The default limits for each audience (ADR 2.3). A host may declare a platform limit instead, such as 128 MB on Cloudflare. */
export const toolScriptDefaultLimits: Readonly<Record<ToolScriptAudience, ToolScriptLimits>> = {
  user: { ...sharedLimits, wallClockMs: null, calls: 100 },
  agent: { ...sharedLimits, wallClockMs: 60_000, calls: 50 },
};

/**
 * The limits a run gets: for each limit the lowest of the host's and every
 * given lower set. A value above the host's, or a `null` wall clock, is
 * ignored, so a header can't raise a limit. Throws a `RangeError` for a
 * value that isn't a positive whole number, or a name that isn't a limit.
 *
 * @example
 * effectiveToolScriptLimits(host.limits, artifact.header.limits, request.limits);
 */
export function effectiveToolScriptLimits(
  host: ToolScriptLimits,
  ...lower: readonly (Partial<ToolScriptLimits> | undefined)[]
): ToolScriptLimits {
  const result: Record<string, number | null> = { ...host };
  for (const set of lower) {
    for (const [name, value] of Object.entries(set ?? {})) {
      if (!(name in host)) throw new RangeError(`not a ToolScript limit: ${name}`);
      result[name] = lowered(name, result[name] ?? null, value);
    }
  }
  return result as unknown as ToolScriptLimits;
}

function lowered(name: string, current: number | null, value: unknown): number | null {
  // `null` would mean "no wall-clock limit", which only raises: ignored like any raise.
  if (value === undefined || value === null) return current;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new RangeError(`limit ${name} is not a positive whole number: ${String(value)}`);
  }
  return current === null ? value : Math.min(current, value);
}

/** The capability id form: `<namespace>.<name>@<version>`, such as `github.set-variable@1`. */
export const toolScriptCapabilityIdPattern =
  /^([a-z][a-z0-9]*)\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)@[1-9]\d*$/;

/**
 * Where a capability sits on `ctx`: `github.set-variable@1` is
 * `ctx.github.setVariable`. Returns `undefined` for an id that doesn't match
 * {@link toolScriptCapabilityIdPattern}.
 */
export function toolScriptCapabilityPath(
  id: string,
): { namespace: string; method: string } | undefined {
  const match = toolScriptCapabilityIdPattern.exec(id);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  const method = match[2].replace(/-([a-z0-9])/g, (_dash, letter: string) => letter.toUpperCase());
  return { namespace: match[1], method };
}

/** How risky a capability, a write or a script is (ADR 4). */
export type ToolScriptRisk = "routine" | "admin" | "irreversible";

/** What a capability is given for one call, besides its arguments. */
export interface ToolScriptCallContext {
  readonly runId: string;
  /** Aborted when the run ends, is cancelled or trips a limit. */
  readonly signal: AbortSignal;
}

/**
 * One reviewed operation a script may call through `ctx`. It runs outside
 * the isolate, gets a frozen plain-data copy of the arguments, adds any
 * credential itself, and returns only its declared fields (S6).
 */
export interface ToolScriptCapability {
  /** Such as `github.set-variable@1`. */
  readonly id: string;
  /** Exactly one audience (S1). */
  readonly audience: ToolScriptAudience;
  /** A `write` is confirmed before it is called (S9); a `read` runs without asking. */
  readonly kind: "read" | "write";
  readonly risk: ToolScriptRisk;
  call(args: ToolScriptData, context: ToolScriptCallContext): Promise<ToolScriptData>;
}

/** The capabilities of one audience, by id. The wiring builds it; no ToolScript package imports one (S5). */
export interface ToolScriptRegistry {
  readonly audience: ToolScriptAudience;
  readonly capabilities: ReadonlyMap<string, ToolScriptCapability>;
}

/** One write, as the person or the agent's approval rule confirms it: the frozen copy that will be sent. */
export interface ToolScriptWrite {
  readonly capability: string;
  readonly risk: ToolScriptRisk;
  readonly args: ToolScriptData;
}

/**
 * Asked before writes are sent, with exactly the frozen copies that will be
 * sent; one write, or every write of a `ctx.batch`. `false` stops the run
 * with `toolscript.declined`. An agent host's wiring passes its approval rule.
 */
export type ToolScriptConfirm = (writes: readonly ToolScriptWrite[]) => Promise<boolean>;

/**
 * What a host reads of an artifact's header. The full header (inputs,
 * touches, ui, …) is `core/toolscript`'s schema; the host gets it all and
 * reads the rest through that package.
 */
export interface ToolScriptArtifactHeader {
  readonly format: "halonic.toolscript/1";
  readonly id: string;
  readonly version: number;
  readonly audience: ToolScriptAudience;
  /** Every capability the script calls, by id. `ctx` has exactly these (S3). */
  readonly uses: readonly string[];
  readonly limits?: Partial<ToolScriptLimits>;
  readonly [field: string]: unknown;
}

/** A built ToolScript (ADR 1.4). Hosts run only artifacts, never TypeScript. */
export interface ToolScriptArtifact {
  readonly header: ToolScriptArtifactHeader;
  /** The stripped JavaScript: an ES module that exports `run(ctx)`. */
  readonly code: string;
  /** Lowercase hex SHA-256 of the TypeScript source. */
  readonly sourceHash: string;
  /** Lowercase hex SHA-256 of `code` as UTF-8. A host refuses code that doesn't match it. */
  readonly codeHash: string;
  readonly profileVersion: number;
}

/** One run. */
export interface ToolScriptRunRequest {
  /** Unique per run; secret handles and stubs are bound to it (S7, S16). */
  readonly runId: string;
  readonly artifact: ToolScriptArtifact;
  readonly registry: ToolScriptRegistry;
  /** `ctx.input`. */
  readonly input: ToolScriptData;
  /** Lower limits for this run only. */
  readonly limits?: Partial<ToolScriptLimits>;
  readonly confirm: ToolScriptConfirm;
  readonly signal?: AbortSignal;
}

/** What every run reports, whatever its outcome (the run log, ADR 7.4). */
export interface ToolScriptRunTrace {
  /** The capability ids called, in order. Never their arguments (S13). */
  readonly calls: readonly string[];
  /** `ctx.log` lines: untrusted text from the script (S11). */
  readonly log: readonly string[];
}

/** A run's outcome. A failure carries a listed reason and at most a short message, never a stack (S13). */
export type ToolScriptRunResult =
  | (ToolScriptRunTrace & { readonly ok: true; readonly output: ToolScriptData })
  | (ToolScriptRunTrace & {
      readonly ok: false;
      readonly reason: ToolScriptReason;
      readonly message?: string;
    });

/**
 * Runs ToolScript artifacts in an isolate, for one audience only (ADR
 * "Halonic ToolScript"; requirement `ports.tool-script-host`).
 *
 * `run` never rejects: every failure is a result with a listed reason. Before
 * anything runs, the host refuses an artifact, registry or capability of the
 * other audience (`toolscript.wrong-audience`), code whose SHA-256 isn't
 * `codeHash`, and a `uses` entry the registry lacks. `ctx` holds only the
 * capabilities in `uses`. A tripped limit, a declined write or a cancel
 * stops the run at once; a `ctx` call after that never settles.
 *
 * @example
 * const result = await host.run({ runId, artifact, registry, input, confirm });
 * if (!result.ok) record.fail(result.reason);
 */
export interface ToolScriptHost {
  readonly audience: ToolScriptAudience;
  /** This host's limits before a header or request lowers them. */
  readonly limits: ToolScriptLimits;
  run(request: ToolScriptRunRequest): Promise<ToolScriptRunResult>;
}
