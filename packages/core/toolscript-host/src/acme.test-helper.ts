import {
  isToolScriptSecretHandle,
  isToolScriptStop,
  type ToolScriptArtifact,
  type ToolScriptAudience,
  type ToolScriptData,
  type ToolScriptIsolate,
  type ToolScriptIsolateFunction,
  type ToolScriptIsolateRequest,
  type ToolScriptIsolateResult,
  type ToolScriptIsolateValue,
  type ToolScriptReason,
  type ToolScriptRunResult,
  ToolScriptStop,
  type ToolScriptWrite,
  toolScriptDefaultLimits,
} from "@halonicjs/ports";
import type { ToolScriptHostCapability } from "./capability.ts";
import { createToolScriptHost } from "./host.ts";

/** What a test script gets as `ctx`: `input`, `log`, `fail` and the host's functions. */
export type AcmeContext = Readonly<Record<string, unknown>>;

/** Calls `ctx.<name>` or `ctx.<namespace>.<method>`, as a script would. */
export function ctxCall(ctx: AcmeContext, path: string, args?: unknown): Promise<unknown> {
  const [first = "", second] = path.split(".");
  const member = ctx[first] as Record<string, unknown> | ((args?: unknown) => Promise<unknown>);
  const fn = second === undefined ? member : (member as Record<string, unknown>)[second];
  if (typeof fn !== "function") throw new TypeError(`ctx.${path} is not a function`);
  return fn(args);
}

/** One field of `ctx.input`. */
export function inputField(ctx: AcmeContext, name: string): unknown {
  return (ctx["input"] as Readonly<Record<string, unknown>>)[name];
}

/** A test script: run in the process by {@link inProcessIsolate}, keyed by its code. */
export type AcmeScript = (ctx: AcmeContext) => Promise<unknown>;

/**
 * An isolate stand-in that runs a function in the process: no boundary at
 * all, so these tests show only the host's own checks. The QuickJS wiring
 * runs the same rules against a real isolate.
 */
export function inProcessIsolate(scripts: ReadonlyMap<string, AcmeScript>): ToolScriptIsolate {
  const limits = toolScriptDefaultLimits.user;
  return {
    limits,
    async run(request): Promise<ToolScriptIsolateResult> {
      const log: string[] = [];
      const script = scripts.get(request.code);
      if (script === undefined) return { ok: false, reason: "toolscript.failed", log, limits };
      try {
        const output = (await script(buildCtx(request, log))) ?? null;
        return { ok: true, output: output as ToolScriptData, log, limits };
      } catch (error) {
        return { ok: false, ...failure(error), log, limits };
      }
    },
  };
}

function buildCtx(request: ToolScriptIsolateRequest, log: string[]): AcmeContext {
  const ctx: Record<string, unknown> = {
    input: request.input,
    log: (line: string) => log.push(line),
    // The real isolate owns a synchronous `fail` (HAL-20448), so the stand-in does too.
    fail: (message: unknown) => {
      throw new ToolScriptStop("toolscript.failed", typeof message === "string" ? message : "");
    },
  };
  const context = { runId: request.runId, signal: new AbortController().signal };
  for (const [name, entry] of Object.entries(request.functions)) {
    if (typeof entry === "function") {
      ctx[name] = bind(entry, context);
      continue;
    }
    ctx[name] = Object.fromEntries(
      Object.entries(entry).map(([key, fn]) => [key, bind(fn, context)]),
    );
  }
  return Object.freeze(ctx) as AcmeContext;
}

function failure(error: unknown): { reason: ToolScriptReason; message?: string } {
  if (isToolScriptStop(error)) {
    return error.message === error.reason
      ? { reason: error.reason }
      : { reason: error.reason, message: error.message };
  }
  if (error instanceof CapabilityFailed) return { reason: "toolscript.capability-failed" };
  return { reason: "toolscript.script-error" };
}

class CapabilityFailed extends Error {}

function bind(fn: ToolScriptIsolateFunction, context: Parameters<ToolScriptIsolateFunction>[1]) {
  return async (args: unknown) => {
    try {
      return await fn(copy(args ?? null), context);
    } catch (error) {
      throw isToolScriptStop(error) ? error : new CapabilityFailed();
    }
  };
}

/** A fresh plain copy, as the isolate makes one (S15), with handles kept as they are. */
function copy(value: unknown): ToolScriptIsolateValue {
  if (isToolScriptSecretHandle(value) || typeof value !== "object" || value === null) {
    return value as ToolScriptIsolateValue;
  }
  if (Array.isArray(value)) return value.map(copy);
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, copy(inner)]));
}

/** Makes an `acme` capability; `call` records what it was sent. */
export function acmeCapability(
  id: string,
  options: Partial<ToolScriptHostCapability> = {},
  audience: ToolScriptAudience = "user",
): ToolScriptHostCapability {
  return {
    id,
    audience,
    kind: "write",
    risk: "routine",
    call: async () => ({ saved: true }),
    ...options,
  };
}

/** Everything one test needs to run a script on a user host over an `acme` registry. */
export interface AcmeRun {
  readonly result: ToolScriptRunResult;
  readonly confirmed: (readonly ToolScriptWrite[])[];
}

/** Options for {@link runAcme}. */
export interface AcmeRunOptions {
  readonly capabilities: readonly ToolScriptHostCapability[];
  readonly header?: Record<string, unknown>;
  readonly input?: ToolScriptData;
  readonly decline?: boolean;
  readonly hostAudience?: ToolScriptAudience;
  /** The audience of the artifact and the registry, and of the host unless `hostAudience` says otherwise. */
  readonly audience?: ToolScriptAudience;
  /** Overrides the artifact's `codeHash`. */
  readonly codeHash?: string;
  /** Overrides `uses`; the capabilities given are still the registry. */
  readonly uses?: readonly string[];
}

/** Runs `script` once on a fresh user host with the given capabilities, all in `uses`. */
export async function runAcme(script: AcmeScript, options: AcmeRunOptions): Promise<AcmeRun> {
  const code = `acme script ${crypto.randomUUID()}`;
  const host = createToolScriptHost({
    audience: options.hostAudience ?? options.audience ?? "user",
    isolate: inProcessIsolate(new Map([[code, script]])),
    now: () => "2026-01-01T00:00:00.000Z",
    digest: {
      sha256: async (data) =>
        new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data))),
    },
    randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
  });
  const confirmed: (readonly ToolScriptWrite[])[] = [];
  const artifact: ToolScriptArtifact = {
    header: {
      format: "halonic.toolscript/1",
      id: "acme.test",
      version: 1,
      audience: options.audience ?? "user",
      uses: options.uses ?? options.capabilities.map((capability) => capability.id),
      // An empty entry per capability allows any target; a test about `touches` sets its own.
      touches: Object.fromEntries(options.capabilities.map((capability) => [capability.id, {}])),
      ...options.header,
    },
    code,
    sourceHash: await sha256(code),
    codeHash: options.codeHash ?? (await sha256(code)),
    profileVersion: 1,
  };
  const result = await host.run({
    runId: "run-acme",
    artifact,
    registry: {
      audience: options.audience ?? "user",
      capabilities: new Map(options.capabilities.map((capability) => [capability.id, capability])),
    },
    input: options.input ?? {},
    confirm: async (writes) => {
      confirmed.push(writes);
      return options.decline !== true;
    },
  });
  return { result, confirmed };
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
