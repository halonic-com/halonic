import {
  effectiveToolScriptLimits,
  type ToolScriptAudience,
  type ToolScriptCapability,
  type ToolScriptData,
  type ToolScriptHost,
  type ToolScriptLimits,
  type ToolScriptReason,
  type ToolScriptRunRequest,
  type ToolScriptRunResult,
  toolScriptCapabilityPath,
  toolScriptDefaultLimits,
  toolScriptMessageCharacters,
} from "@halonicjs/ports";

/** What a fake script gets as `ctx`: the input, `log`, `fail`, `now`, and one namespace per capability in `uses`. */
export interface FakeToolScriptContext {
  readonly input: ToolScriptData;
  log(line: string): void;
  fail(message: string): never;
  now(): Promise<string>;
  readonly [namespace: string]: unknown;
}

/** Stands in for an artifact's code: the fake runs it in the process instead of in an isolate. */
export type FakeToolScript = (ctx: FakeToolScriptContext) => Promise<unknown>;

/** Options for {@link FakeToolScriptHost}. */
export interface FakeToolScriptHostOptions {
  audience: ToolScriptAudience;
  /** The scripts it may run, by `codeHash`. Any other artifact is `toolscript.unpinned`. */
  scripts: ReadonlyMap<string, FakeToolScript>;
  /** Its limits; the audience's defaults when left out. */
  limits?: ToolScriptLimits;
  /** What `ctx.now()` answers. */
  now?: () => string;
}

const never = new Promise<never>(() => undefined);

/** Thrown by `ctx.fail` to unwind the script; the run has already stopped. */
const failed = Symbol("failed");

interface CopyCaps {
  bytes: number;
  depth: number;
  items: number;
}

const uncapped = { depth: Number.POSITIVE_INFINITY, items: Number.POSITIVE_INFINITY };

/**
 * A {@link ToolScriptHost} that runs in the process, for building and testing
 * what sits on top of the port before an isolate exists. It checks what the
 * port promises (audience, code hash, `uses`, plain-data copies, confirmed
 * writes, the call, input, output and log limits, cancel) but runs a given
 * function instead of the artifact's code, so it is no boundary: it has no
 * CPU, memory, stack or wall-clock limit and can't tell a `Proxy` from a
 * plain object. The fence suite is for real isolates.
 */
export class FakeToolScriptHost implements ToolScriptHost {
  readonly audience: ToolScriptAudience;
  readonly limits: ToolScriptLimits;
  readonly #scripts: ReadonlyMap<string, FakeToolScript>;
  readonly #now: () => string;

  constructor(options: FakeToolScriptHostOptions) {
    this.audience = options.audience;
    this.limits = options.limits ?? toolScriptDefaultLimits[options.audience];
    this.#scripts = options.scripts;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async run(request: ToolScriptRunRequest): Promise<ToolScriptRunResult> {
    const run = new FakeRun(request);
    const refusal = await this.#refusal(request);
    if (refusal !== undefined) return run.halt(refusal);
    let limits: ToolScriptLimits;
    try {
      limits = effectiveToolScriptLimits(this.limits, request.artifact.header.limits);
    } catch {
      return run.halt("toolscript.bad-artifact");
    }
    limits = effectiveToolScriptLimits(limits, request.limits);
    const input = copyPlainData(request.input, { ...uncapped, bytes: limits.inputBytes });
    if (input.ok === false) return run.halt(input.tooBig ? "limit.input" : "toolscript.bad-input");
    const script = this.#scripts.get(request.artifact.codeHash);
    if (script === undefined) return run.halt("toolscript.unpinned");
    run.start(script, this.#context(run, limits, input.value), limits);
    return run.result;
  }

  async #refusal(request: ToolScriptRunRequest): Promise<ToolScriptReason | undefined> {
    const { artifact, registry } = request;
    if (request.signal?.aborted === true) return "toolscript.cancelled";
    if (artifact.header.audience !== this.audience || registry.audience !== this.audience) {
      return "toolscript.wrong-audience";
    }
    if (!isWellFormed(artifact.header)) return "toolscript.bad-artifact";
    if ((await sha256Hex(artifact.code)) !== artifact.codeHash) {
      return "toolscript.code-hash-mismatch";
    }
    for (const id of artifact.header.uses) {
      const capability = registry.capabilities.get(id);
      if (capability === undefined) return "toolscript.unknown-capability";
      if (capability.audience !== this.audience) return "toolscript.wrong-audience";
    }
    return undefined;
  }

  #context(run: FakeRun, limits: ToolScriptLimits, input: ToolScriptData): FakeToolScriptContext {
    const namespaces: Record<string, Record<string, (args: unknown) => Promise<unknown>>> = {};
    for (const id of run.request.artifact.header.uses) {
      const path = toolScriptCapabilityPath(id);
      const capability = run.request.registry.capabilities.get(id);
      if (path === undefined || capability === undefined) continue;
      const namespace = namespaces[path.namespace] ?? {};
      namespace[path.method] = (args) => run.call(capability, args, limits);
      namespaces[path.namespace] = namespace;
    }
    for (const namespace of Object.values(namespaces)) Object.freeze(namespace);
    return Object.freeze({
      ...namespaces,
      input,
      log: (line: string) => run.log(line, limits),
      fail: (message: string): never => {
        run.halt("toolscript.failed", message);
        throw failed;
      },
      now: async () => this.#now(),
    });
  }
}

/** One run's state: what it called and logged, and the one result it settles with. */
class FakeRun {
  readonly request: ToolScriptRunRequest;
  readonly result: Promise<ToolScriptRunResult>;
  readonly #calls: string[] = [];
  readonly #log: string[] = [];
  readonly #ended = new AbortController();
  #settle: (result: ToolScriptRunResult) => void = () => undefined;
  #stopped = false;
  readonly #onAbort = () => this.halt("toolscript.cancelled");

  constructor(request: ToolScriptRunRequest) {
    this.request = request;
    this.result = new Promise((resolve) => {
      this.#settle = resolve;
    });
    request.signal?.addEventListener("abort", this.#onAbort, { once: true });
  }

  start(script: FakeToolScript, ctx: FakeToolScriptContext, limits: ToolScriptLimits): void {
    script(ctx).then(
      (output) => this.#complete(output, limits),
      (error: unknown) => {
        if (error !== failed) this.halt("toolscript.script-error", messageOf(error));
      },
    );
  }

  /** Stops the run with a reason; a later stop or output changes nothing. */
  halt(reason: ToolScriptReason, message?: string): Promise<ToolScriptRunResult> {
    this.#end({ ok: false, reason, ...this.#trace(), ...shortMessage(message) });
    return this.result;
  }

  async call(capability: ToolScriptCapability, args: unknown, limits: ToolScriptLimits) {
    if (this.#stopped) return never;
    if (this.#calls.length >= limits.calls) return this.#haltCall("limit.calls");
    const copy = copyPlainData(args, {
      bytes: limits.argumentBytes,
      depth: limits.argumentDepth,
      items: limits.argumentItems,
    });
    if (copy.ok === false) return this.#haltCall("toolscript.bad-argument");
    if (capability.kind === "write") {
      const write = { capability: capability.id, risk: capability.risk, args: copy.value };
      const confirmed = await this.request.confirm([write]);
      if (this.#stopped) return never;
      if (!confirmed) return this.#haltCall("toolscript.declined");
    }
    this.#calls.push(capability.id);
    const context = { runId: this.request.runId, signal: this.#ended.signal };
    let answer: unknown;
    try {
      answer = await capability.call(copy.value, context);
    } catch {
      // The code only: a capability's message may echo upstream text, such as a URL with a token (S13).
      return this.#haltCall("toolscript.capability-failed");
    }
    if (this.#stopped) return never;
    const back = copyPlainData(answer, { ...uncapped, bytes: Number.POSITIVE_INFINITY });
    if (back.ok === false) return this.#haltCall("toolscript.capability-failed");
    return back.value;
  }

  log(line: string, limits: ToolScriptLimits): void {
    if (this.#stopped) return;
    if (this.#log.length >= limits.logLines) {
      this.halt("limit.log");
      return;
    }
    this.#log.push(String(line).slice(0, limits.logLineCharacters));
  }

  #haltCall(reason: ToolScriptReason, message?: string): Promise<never> {
    this.halt(reason, message);
    return never;
  }

  #complete(output: unknown, limits: ToolScriptLimits): void {
    if (this.#stopped) return;
    const copy = copyPlainData(output ?? null, { ...uncapped, bytes: limits.outputBytes });
    if (copy.ok === false) {
      this.halt(copy.tooBig ? "limit.output" : "toolscript.bad-output");
      return;
    }
    this.#end({ ok: true, output: copy.value, ...this.#trace() });
  }

  #end(result: ToolScriptRunResult): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#ended.abort();
    this.request.signal?.removeEventListener("abort", this.#onAbort);
    this.#settle(result);
  }

  #trace() {
    return { calls: [...this.#calls], log: [...this.#log] };
  }
}

function isWellFormed(header: ToolScriptRunRequest["artifact"]["header"]): boolean {
  if (header.format !== "halonic.toolscript/1" || !Array.isArray(header.uses)) return false;
  const paths = header.uses.map((id) => toolScriptCapabilityPath(id));
  if (paths.some((path) => path === undefined)) return false;
  const keys = paths.map((path) => `${path?.namespace}.${path?.method}`);
  return new Set(keys).size === keys.length;
}

type Copied = { ok: true; value: ToolScriptData } | { ok: false; tooBig: boolean };

/**
 * Copies plain data without calling anything in it: no getter, `toJSON` or
 * `valueOf` (S15). Refuses other prototypes, symbols, holes, cycles and
 * non-finite numbers, and anything over the caps.
 */
function copyPlainData(value: unknown, caps: CopyCaps): Copied {
  const result = copyValue(value, 1, caps, new Set());
  if (result === undefined) return { ok: false, tooBig: false };
  const size = new TextEncoder().encode(JSON.stringify(result)).length;
  return size > caps.bytes ? { ok: false, tooBig: true } : { ok: true, value: result };
}

function copyValue(
  item: unknown,
  depth: number,
  caps: CopyCaps,
  seen: Set<object>,
): ToolScriptData | undefined {
  if (item === null || typeof item === "boolean" || typeof item === "string") return item;
  if (typeof item === "number") return Number.isFinite(item) ? item : undefined;
  if (typeof item !== "object" || depth > caps.depth || seen.has(item)) return undefined;
  seen.add(item);
  const entries = copyEntries(item, depth, caps, seen);
  seen.delete(item);
  if (entries === undefined) return undefined;
  if (!Array.isArray(item)) return Object.freeze(Object.fromEntries(entries));
  if (entries.length !== item.length) return undefined;
  return Object.freeze(entries.map(([, inner]) => inner));
}

/** An array's or object's own data entries, copied; `undefined` for anything that isn't plain. */
function copyEntries(
  item: object,
  depth: number,
  caps: CopyCaps,
  seen: Set<object>,
): [string, ToolScriptData][] | undefined {
  const prototype = Object.getPrototypeOf(item);
  if (prototype !== Array.prototype && prototype !== Object.prototype) return undefined;
  const keys = Reflect.ownKeys(item).filter((key) => !(Array.isArray(item) && key === "length"));
  if (keys.length > caps.items) return undefined;
  const entries: [string, ToolScriptData][] = [];
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    if (typeof key === "symbol" || descriptor === undefined || !("value" in descriptor)) {
      return undefined;
    }
    const inner = copyValue(descriptor.value, depth + 1, caps, seen);
    if (inner === undefined) return undefined;
    entries.push([key, inner]);
  }
  return entries;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortMessage(message: string | undefined): { message?: string } {
  return message === undefined ? {} : { message: message.slice(0, toolScriptMessageCharacters) };
}

/** Lowercase hex SHA-256 of a string as UTF-8, as `codeHash` holds it. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
