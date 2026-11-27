import {
  type ToolScriptCallContext,
  type ToolScriptData,
  type ToolScriptIsolateFunction,
  type ToolScriptIsolateFunctions,
  type ToolScriptIsolateValue,
  type ToolScriptRunRequest,
  type ToolScriptSecretHandle,
  ToolScriptStop,
  toolScriptCapabilityPath,
} from "@halonicjs/ports";
import type { ToolScriptHostCapability, ToolScriptHostWrite } from "./capability.ts";
import type { HeaderView } from "./header-view.ts";
import { deepFreeze, isPlainAnswer } from "./plain-data.ts";
import { handlesInPlace, redacted, type SecretTable } from "./secrets.ts";
import { withinTouches } from "./touches.ts";

/** A call checked and frozen, ready to confirm and send. */
interface Prepared {
  readonly capability: ToolScriptHostCapability;
  /** Exactly what is sent: the isolate's copy, deep-frozen, handles included. */
  readonly frozen: ToolScriptIsolateValue;
  /** The same copy with handles shown by input name, for the schema, `touches`, previews and `confirm`. */
  readonly shown: ToolScriptData;
}

/**
 * The parent side of one run (S16): it builds `ctx`'s host functions from
 * `uses` and checks every call itself, whatever the isolate has already
 * checked. Each call is frozen first; the schema, the secret fields and
 * `touches` are checked on that frozen copy; a write is confirmed with it
 * and exactly it is sent, with nothing from the script in between (S9, S14).
 */
export class HostRun {
  /** The capability ids sent, in order: the run's trace (S13). */
  readonly calls: string[] = [];
  readonly #request: ToolScriptRunRequest;
  readonly #view: HeaderView;
  readonly #table: SecretTable;
  readonly #now: () => string;

  constructor(
    request: ToolScriptRunRequest,
    view: HeaderView,
    table: SecretTable,
    now: () => string,
  ) {
    this.#request = request;
    this.#view = view;
    this.#table = table;
    this.#now = now;
  }

  /** `ctx`'s host functions: one namespace per capability in `uses`, then `now` and `batch` (the isolate owns `input`, `log` and `fail`). */
  functions(): ToolScriptIsolateFunctions {
    const namespaces: Record<string, Record<string, ToolScriptIsolateFunction>> = {};
    for (const id of this.#request.artifact.header.uses) {
      const path = toolScriptCapabilityPath(id);
      const capability = this.#capability(id);
      if (path === undefined || capability === undefined) continue;
      const namespace = namespaces[path.namespace] ?? {};
      namespace[path.method] = (args, context) => this.#call(capability, args, context);
      namespaces[path.namespace] = namespace;
    }
    return {
      ...namespaces,
      now: async () => this.#now(),
      batch: (items, context) => this.#batch(items, context),
    };
  }

  async #call(
    capability: ToolScriptHostCapability,
    args: ToolScriptIsolateValue,
    context: ToolScriptCallContext,
  ): Promise<ToolScriptIsolateValue> {
    const prepared = this.#prepare(capability, args);
    if (capability.kind === "write") await this.#confirm([prepared], context);
    return this.#send(prepared, context);
  }

  /**
   * `ctx.batch([{ use, args }, …])`: several writes, checked and frozen
   * together, confirmed as one list, then sent in order. A read, or an
   * `irreversible` write, can't be in a batch (S9).
   */
  async #batch(
    items: ToolScriptIsolateValue,
    context: ToolScriptCallContext,
  ): Promise<ToolScriptIsolateValue> {
    if (!Array.isArray(items) || items.length === 0)
      throw new ToolScriptStop("toolscript.bad-argument");
    const prepared = items.map((item: ToolScriptIsolateValue) => this.#batchItem(item));
    await this.#confirm(prepared, context);
    const answers: ToolScriptIsolateValue[] = [];
    for (const item of prepared) answers.push(await this.#send(item, context));
    return answers;
  }

  #batchItem(item: ToolScriptIsolateValue): Prepared {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ToolScriptStop("toolscript.bad-argument");
    }
    const { use, args } = item as Readonly<Record<string, ToolScriptIsolateValue>>;
    const capability = typeof use === "string" ? this.#capability(use) : undefined;
    if (capability === undefined || capability.kind !== "write" || args === undefined) {
      throw new ToolScriptStop(
        "toolscript.bad-argument",
        "a batch holds only writes this script uses",
      );
    }
    if (capability.risk === "irreversible")
      throw new ToolScriptStop("toolscript.irreversible-in-batch");
    return this.#prepare(capability, args);
  }

  #prepare(capability: ToolScriptHostCapability, args: ToolScriptIsolateValue): Prepared {
    const frozen = deepFreeze(args);
    if (!handlesInPlace(frozen, capability.secretFields ?? [], this.#table)) {
      throw new ToolScriptStop("toolscript.bad-handle");
    }
    const shown = redacted(frozen, this.#table);
    if (capability.acceptsArguments !== undefined && !capability.acceptsArguments(shown)) {
      throw new ToolScriptStop("toolscript.bad-argument");
    }
    const { touches } = this.#view;
    // A header without `touches` declares no targets to hold writes to; one with it covers every write (S14).
    if (capability.kind === "write" && touches !== undefined) {
      if (!withinTouches(shown, touches[capability.id], this.#request.input)) {
        throw new ToolScriptStop("toolscript.undeclared-target");
      }
    }
    return { capability, frozen, shown };
  }

  async #confirm(prepared: readonly Prepared[], context: ToolScriptCallContext): Promise<void> {
    const writes = prepared.map((item) => this.#write(item));
    const confirmed = await this.#request.confirm(writes);
    if (context.signal.aborted) throw new ToolScriptStop("toolscript.cancelled");
    if (!confirmed) throw new ToolScriptStop("toolscript.declined");
  }

  #write({ capability, shown }: Prepared): ToolScriptHostWrite {
    const write = { capability: capability.id, risk: capability.risk, args: shown };
    const fromCapability = capability.preview?.(shown) ?? [];
    const fromHeader = this.#view.preview;
    if (fromHeader.length === 0 && fromCapability.length === 0) return write;
    return {
      ...write,
      preview: { fromHeader, fromCapability: Object.freeze([...fromCapability]) },
    };
  }

  async #send(prepared: Prepared, context: ToolScriptCallContext): Promise<ToolScriptIsolateValue> {
    if (context.signal.aborted) throw new ToolScriptStop("toolscript.cancelled");
    this.calls.push(prepared.capability.id);
    const table = this.#table;
    // Secret handles reach only the fields the capability declared secret (checked in #prepare).
    const args = prepared.frozen as ToolScriptData;
    const answer = await prepared.capability.call(args, {
      ...context,
      secret: (handle: ToolScriptSecretHandle) => table.reveal(handle),
    } as ToolScriptCallContext);
    if (!isPlainAnswer(answer))
      throw new Error("the capability answered with data that isn't plain");
    return answer;
  }

  #capability(id: string): ToolScriptHostCapability | undefined {
    if (!this.#request.artifact.header.uses.includes(id)) return undefined;
    return this.#request.registry.capabilities.get(id);
  }
}
