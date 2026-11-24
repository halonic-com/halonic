import type { ToolScriptSecretHandle } from "@halonicjs/ports";

/** Every handle id starts with this; a string that holds it anywhere is treated as a handle. */
export const handleIdPrefix = "toolscript-handle:";

/**
 * One run's secret handles (ADR S7). Each handle a host function gives the
 * script becomes a random id made for this run only; the secret's
 * reference never enters the isolate. The table lives and dies with the
 * run, so another run's ids and an ended run's ids are unknown.
 */
export class HandleTable {
  readonly #byId = new Map<string, ToolScriptSecretHandle>();
  readonly #byHandle = new Map<ToolScriptSecretHandle, string>();

  /** The id the script sees for `handle`; the same handle always gets the same id. */
  idFor(handle: ToolScriptSecretHandle): string {
    const known = this.#byHandle.get(handle);
    if (known !== undefined) return known;
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id =
      handleIdPrefix + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    this.#byId.set(id, handle);
    this.#byHandle.set(handle, id);
    return id;
  }

  /** The handle for an id this run made, or `undefined` for a forged, foreign or ended id. */
  handleFor(id: string): ToolScriptSecretHandle | undefined {
    return this.#byId.get(id);
  }

  /** Forgets every id, when the run ends. */
  clear(): void {
    this.#byId.clear();
    this.#byHandle.clear();
  }
}
