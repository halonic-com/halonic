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
import { deepFreeze, frozenCopy, isPlainAnswer } from "./plain-data.ts";
import { handlesInPlace, type SecretTable, secretInputsOf } from "./secrets.ts";
import { withinTouches } from "./touches.ts";

/** A call checked and frozen, ready to confirm and send. */
interface Prepared {
  readonly capability: ToolScriptHostCapability;
  /**
   * The isolate's copy, deep-frozen, handles included: the one object the
   * schema, `touches`, the preview and `confirm` see, and exactly what is
   * sent (S9). A handle holds only its random reference, never the value.
   */
  readonly frozen: ToolScriptData;
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
  readonly #callLimit: number;
  /** Calls counted against `#callLimit`: sent, or checked and on their way (see `#reserve`). */
  #reserved = 0;
  /** `ui.preview`, copied and deep-frozen once, so `confirm` can't change it for later writes. */
  readonly #headerPreview: readonly ToolScriptData[];

  constructor(
    request: ToolScriptRunRequest,
    view: HeaderView,
    table: SecretTable,
    now: () => string,
    callLimit: number,
  ) {
    this.#request = request;
    this.#view = view;
    this.#table = table;
    this.#now = now;
    this.#callLimit = callLimit;
    this.#headerPreview = frozenCopy([...view.preview]);
  }

  /**
   * `ctx`'s host functions: one namespace per capability in `uses`, then
   * `now`, and `batch` on a user run only (the isolate owns `input`, `log`
   * and `fail`). An agent run gets no `batch`: ADR 3.2 gives agents no
   * person to confirm one, and the isolate would count a batch as one call.
   */
  functions(): ToolScriptIsolateFunctions {
    // Maps, so a namespace or method named like `constructor` never reads a prototype.
    const namespaces = new Map<string, Map<string, ToolScriptIsolateFunction>>();
    for (const id of this.#request.artifact.header.uses) {
      const path = toolScriptCapabilityPath(id);
      const capability = this.#capability(id);
      if (path === undefined || capability === undefined) continue;
      const namespace =
        namespaces.get(path.namespace) ?? new Map<string, ToolScriptIsolateFunction>();
      namespace.set(path.method, (args, context) => this.#call(capability, args, context));
      namespaces.set(path.namespace, namespace);
    }
    const functions: Record<string, ToolScriptIsolateFunctions[string]> = Object.fromEntries(
      [...namespaces].map(([name, methods]) => [name, Object.fromEntries(methods)]),
    );
    functions["now"] = async () => this.#now();
    if (this.#request.artifact.header.audience === "user") {
      functions["batch"] = (items, context) => this.#batch(items, context);
    }
    return functions;
  }

  async #call(
    capability: ToolScriptHostCapability,
    args: ToolScriptIsolateValue,
    context: ToolScriptCallContext,
  ): Promise<ToolScriptIsolateValue> {
    // A batch's items count one each, so the isolate's own count can fall short of ours.
    this.#reserve(1);
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
    // The isolate counts a batch as one call, so its items count here against the run's limit.
    this.#reserve(items.length);
    const prepared = items.map((item: ToolScriptIsolateValue) => this.#batchItem(item));
    await this.#confirm(prepared, context);
    const answers: ToolScriptIsolateValue[] = [];
    for (const item of prepared) answers.push(await this.#send(item, context));
    return answers;
  }

  /**
   * Counts `count` calls against the run's limit, or stops with `limit.calls`.
   * It runs before any `await`, so calls started together (`Promise.all`)
   * each see the ones before them, not only the calls already sent.
   */
  #reserve(count: number): void {
    if (this.#reserved + count > this.#callLimit) throw new ToolScriptStop("limit.calls");
    this.#reserved += count;
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
    if (!handlesInPlace(args, capability.secretFields ?? [], this.#table)) {
      throw new ToolScriptStop("toolscript.bad-handle");
    }
    // Handles sit only in top-level secret fields now, and are frozen marked objects.
    const frozen = deepFreeze(args) as ToolScriptData;
    if (capability.acceptsArguments !== undefined && !capability.acceptsArguments(frozen)) {
      throw new ToolScriptStop("toolscript.bad-argument");
    }
    // A user header without `touches` declares no targets, so it allows no write (S14).
    const touches =
      this.#view.touches ?? (this.#request.artifact.header.audience === "user" ? {} : undefined);
    if (capability.kind === "write" && touches !== undefined) {
      if (!withinTouches(frozen, touches[capability.id], this.#request.input)) {
        throw new ToolScriptStop("toolscript.undeclared-target");
      }
    }
    return { capability, frozen };
  }

  async #confirm(prepared: readonly Prepared[], context: ToolScriptCallContext): Promise<void> {
    const writes = prepared.map((item) => this.#write(item));
    const confirmed = await this.#request.confirm(writes);
    if (context.signal.aborted) throw new ToolScriptStop("toolscript.cancelled");
    if (!confirmed) throw new ToolScriptStop("toolscript.declined");
  }

  #write({ capability, frozen }: Prepared): ToolScriptHostWrite {
    const secretInputs = secretInputsOf(frozen, this.#table);
    const write = {
      capability: capability.id,
      risk: capability.risk,
      args: frozen,
      ...(Object.keys(secretInputs).length > 0 ? { secretInputs } : {}),
    };
    const fromCapability = capability.preview?.(frozen) ?? [];
    const fromHeader = this.#headerPreview;
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
    const answer = await prepared.capability.call(prepared.frozen, {
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
