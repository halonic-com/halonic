import {
  isToolScriptSecretHandle,
  type ToolScriptData,
  type ToolScriptIsolateValue,
  type ToolScriptSecretHandle,
  toolScriptSecretHandle,
} from "@halonicjs/ports";
import { bytesToHex, type RandomBytes } from "@halonicjs/std";

/**
 * One run's secret table (S7). Secret inputs enter the isolate only as
 * handles; the values stay here, and a capability reads one through its
 * call context while the run is open.
 */
export class SecretTable {
  readonly #randomBytes: RandomBytes;
  readonly #values = new Map<string, string>();
  readonly #names = new Map<string, string>();
  #open = true;

  constructor(randomBytes: RandomBytes) {
    this.#randomBytes = randomBytes;
  }

  /**
   * `input` as the isolate gets it: each secret input's string replaced by
   * a handle made for this run. A secret input that isn't a string is
   * left out, so the script can't read it.
   */
  isolateInput(input: ToolScriptData, secretInputs: readonly string[]): ToolScriptIsolateValue {
    if (secretInputs.length === 0 || typeof input !== "object" || input === null) return input;
    if (Array.isArray(input)) return input;
    const result: Record<string, ToolScriptIsolateValue> = {};
    for (const [name, value] of Object.entries(input as Record<string, ToolScriptData>)) {
      if (!secretInputs.includes(name)) result[name] = value;
      else if (typeof value === "string") result[name] = this.#handle(name, value);
    }
    return result;
  }

  /** Whether a handle was made by this run and the run is still open. */
  owns(handle: ToolScriptSecretHandle): boolean {
    return this.#open && this.#values.has(handle.reference);
  }

  /** The value behind one of this run's handles, or `undefined`. */
  reveal(handle: ToolScriptSecretHandle): string | undefined {
    return this.owns(handle) ? this.#values.get(handle.reference) : undefined;
  }

  /** The input name a handle stands for, as previews and `confirm` show it. */
  nameOf(handle: ToolScriptSecretHandle): string {
    return this.#names.get(handle.reference) ?? "unknown";
  }

  /** Ends the run: every handle stops working. */
  close(): void {
    this.#open = false;
    this.#values.clear();
  }

  #handle(name: string, value: string): ToolScriptSecretHandle {
    // The reference is random per run, so a handle from one run never names a value in another.
    const reference = `secret:${bytesToHex(this.#randomBytes(16))}`;
    this.#values.set(reference, value);
    this.#names.set(reference, name);
    return toolScriptSecretHandle(reference);
  }
}

/**
 * Whether every handle in `args` sits directly in one of `secretFields`
 * and belongs to this run (S7, S16). Arguments that aren't an object may
 * hold no handle at all.
 */
export function handlesInPlace(
  args: ToolScriptIsolateValue,
  secretFields: readonly string[],
  table: SecretTable,
): boolean {
  if (isToolScriptSecretHandle(args)) return false;
  if (typeof args !== "object" || args === null || Array.isArray(args)) return !holdsHandle(args);
  return Object.entries(args as Record<string, ToolScriptIsolateValue>).every(([field, value]) => {
    if (!isToolScriptSecretHandle(value)) return !holdsHandle(value);
    return secretFields.includes(field) && table.owns(value);
  });
}

/** Whether a value holds a secret handle anywhere inside it. */
export function holdsHandle(value: unknown): boolean {
  if (isToolScriptSecretHandle(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(holdsHandle);
}

/** `args` with every handle shown as `{ secret: "<input name>" }`, for `confirm`, previews and records. */
export function redacted(args: ToolScriptIsolateValue, table: SecretTable): ToolScriptData {
  if (isToolScriptSecretHandle(args)) return Object.freeze({ secret: table.nameOf(args) });
  if (typeof args !== "object" || args === null) return args;
  if (Array.isArray(args)) return Object.freeze(args.map((item) => redacted(item, table)));
  const entries = Object.entries(args as Record<string, ToolScriptIsolateValue>);
  return Object.freeze(
    Object.fromEntries(entries.map(([field, value]) => [field, redacted(value, table)])),
  );
}
