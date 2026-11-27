import {
  effectiveToolScriptLimits,
  type ToolScriptArtifactHeader,
  type ToolScriptAudience,
  type ToolScriptHost,
  type ToolScriptIsolate,
  type ToolScriptIsolateResult,
  type ToolScriptLimits,
  type ToolScriptReason,
  type ToolScriptRunRequest,
  type ToolScriptRunResult,
  toolScriptCapabilityPath,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import { bytesToHex, encodeUtf8, type RandomBytes, type Sha256 } from "@halonicjs/std";
import { type HeaderView, readHeader } from "./header-view.ts";
import { HostRun } from "./host-run.ts";
import { SecretTable } from "./secrets.ts";

/** Options for {@link createToolScriptHost}. */
export interface ToolScriptHostOptions {
  /** The one audience this host runs (S4). */
  readonly audience: ToolScriptAudience;
  /** Runs the script; a fresh isolate per run (S3). */
  readonly isolate: ToolScriptIsolate;
  /** Checks code against `codeHash`; the core has no hash code of its own. */
  readonly digest: Sha256;
  /** Makes secret handle references; should be cryptographically secure. */
  readonly randomBytes: RandomBytes;
  /** The host's limits; the audience's defaults when left out. The isolate's own limits cap them. */
  readonly limits?: ToolScriptLimits;
  /** What `ctx.now()` answers; the wall clock as ISO 8601 when left out. */
  readonly now?: () => string;
}

/**
 * Makes a {@link ToolScriptHost} over any {@link ToolScriptIsolate}
 * (requirement `toolscript-host.audience` and the others in this package's
 * `requirements/`). Before anything runs it refuses an artifact, registry
 * or capability of the other audience, code that doesn't match `codeHash`,
 * and a `uses` entry the registry lacks; then `ctx` gets exactly the
 * capabilities in `uses` and every call is checked on the parent side.
 *
 * @example
 * const host = createToolScriptHost({ audience: "user", isolate, digest, randomBytes });
 * const result = await host.run({ runId, artifact, registry, input, confirm });
 */
export function createToolScriptHost(options: ToolScriptHostOptions): ToolScriptHost {
  const own = options.limits ?? toolScriptDefaultLimits[options.audience];
  const limits = effectiveToolScriptLimits(own, options.isolate.limits);
  const now = options.now ?? (() => new Date().toISOString());
  return {
    audience: options.audience,
    limits,
    run: (request) => runOnce(options, limits, now, request),
  };
}

async function runOnce(
  options: ToolScriptHostOptions,
  hostLimits: ToolScriptLimits,
  now: () => string,
  request: ToolScriptRunRequest,
): Promise<ToolScriptRunResult> {
  const checked = await check(options, request);
  if (typeof checked === "string") return refused(checked);
  let limits: ToolScriptLimits;
  try {
    limits = effectiveToolScriptLimits(hostLimits, request.artifact.header.limits);
  } catch {
    return refused("toolscript.bad-artifact");
  }
  // A bad request limit is the caller's own bug: its RangeError rejects (the port's rule).
  limits = effectiveToolScriptLimits(limits, request.limits);
  const table = new SecretTable(options.randomBytes);
  const run = new HostRun(request, checked, table, now, limits.calls);
  try {
    const result = await options.isolate.run({
      runId: request.runId,
      code: request.artifact.code,
      input: table.isolateInput(request.input, checked.secretInputs),
      functions: run.functions(),
      limits,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    return withTrace(result, run.calls);
  } finally {
    table.close();
  }
}

/** The pre-run refusals (S3, S4), in the port's order; the header view when the run may start. */
async function check(
  { audience, digest }: ToolScriptHostOptions,
  request: ToolScriptRunRequest,
): Promise<HeaderView | ToolScriptReason> {
  const { artifact, registry } = request;
  if (request.signal?.aborted === true) return "toolscript.cancelled";
  if (artifact.header.audience !== audience || registry.audience !== audience) {
    return "toolscript.wrong-audience";
  }
  const view = isWellFormed(artifact.header) ? readHeader(artifact.header) : undefined;
  if (view === undefined) return "toolscript.bad-artifact";
  if (bytesToHex(await digest.sha256(encodeUtf8(artifact.code))) !== artifact.codeHash)
    return "toolscript.code-hash-mismatch";
  for (const id of artifact.header.uses) {
    const capability = registry.capabilities.get(id);
    if (capability === undefined) return "toolscript.unknown-capability";
    if (capability.audience !== audience) return "toolscript.wrong-audience";
  }
  return view;
}

/** `uses` is a list of capability ids with distinct places on `ctx`, none of them `ctx`'s own. */
function isWellFormed(header: ToolScriptArtifactHeader): boolean {
  if (header.format !== "halonic.toolscript/1" || !Array.isArray(header.uses)) return false;
  const places = new Set<string>();
  for (const id of header.uses) {
    const path = toolScriptCapabilityPath(id);
    if (path === undefined) return false;
    places.add(`${path.namespace}.${path.method}`);
  }
  return places.size === header.uses.length;
}

function refused(reason: ToolScriptReason): ToolScriptRunResult {
  return { ok: false, reason, calls: [], log: [] };
}

function withTrace(result: ToolScriptIsolateResult, calls: readonly string[]): ToolScriptRunResult {
  const trace = { calls: [...calls], log: [...result.log] };
  if (result.ok) return { ok: true, output: result.output, ...trace };
  const message = result.message === undefined ? {} : { message: result.message };
  return { ok: false, reason: result.reason, ...message, ...trace };
}
