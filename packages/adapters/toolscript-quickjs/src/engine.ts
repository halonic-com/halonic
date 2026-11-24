/// <reference path="./runtime.d.ts" />
import { newVariant, type QuickJSSyncVariant } from "quickjs-emscripten-core";

const wasmPageBytes = 64 * 1024;

/**
 * The engine's own memory beside the script's heap, in bytes: the size the
 * build starts with (`build.moduleMemoryBytes` in `engine/SOURCES.json`).
 * It holds the 1 MiB C stack (`build.shadowStackBytes`), the engine's
 * static data, the runtime, context and built-ins made before the script
 * starts, and the host's own work after the script has ended and QuickJS's
 * limit is lifted (`RunSession.#scriptDone`).
 */
export const moduleMemoryBytes = 16 * 1024 * 1024;

const engineVariant: QuickJSSyncVariant = {
  type: "sync",
  importFFI: () => import("./generated/engine/ffi.mjs").then((module) => module.QuickJSFFI),
  importModuleLoader: () =>
    import("./generated/engine/quickjs.mjs").then((module) => module.default),
};

/** One run's engine: the variant to load, and the memory it runs in. */
export interface EngineForRun {
  readonly variant: QuickJSSyncVariant;
  readonly memory: WebAssembly.Memory;
}

/**
 * The engine for one run: the module compiled once per process, instantiated
 * again with a memory of its own that starts and stays at
 * {@link moduleMemoryBytes} plus `heapBytes`. The memory's own maximum is
 * the hard limit: the build may grow its memory, but never past the maximum
 * of the one it is given, and a failed grow makes malloc return NULL.
 */
export function engineForRun(heapBytes: number): EngineForRun {
  const pages = Math.ceil((moduleMemoryBytes + heapBytes) / wasmPageBytes);
  const memory = new WebAssembly.Memory({ initial: pages, maximum: pages });
  const variant = newVariant(engineVariant, { wasmModule: compiledEngine, wasmMemory: memory });
  return { variant, memory };
}

let compiled: Promise<WebAssembly.Module> | undefined;

/** Compiling takes longer than starting a run, so it happens once; a failed compile is tried again next time. */
function compiledEngine(): Promise<WebAssembly.Module> {
  compiled ??= compileEngine().catch((error: unknown) => {
    compiled = undefined;
    throw error;
  });
  return compiled;
}

async function compileEngine(): Promise<WebAssembly.Module> {
  // The .wasm as base64 in a module of its own, so loading it needs no file
  // system or network on any runtime.
  const { default: base64 } = await import("./generated/engine/quickjs-wasm.mjs");
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return WebAssembly.compile(bytes);
}
