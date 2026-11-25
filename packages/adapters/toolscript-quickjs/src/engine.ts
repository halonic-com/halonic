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

/**
 * Our build as a variant for `quickjs-emscripten-core`. Its loader refuses to
 * start the glue without a `wasmMemory`: the build keeps memory growth on,
 * so the hard limit is the maximum of the memory we pass in, and a memory
 * the glue made itself could grow without one (Liam, HAL-17780).
 */
export const engineVariant: QuickJSSyncVariant = {
  type: "sync",
  // biome-ignore lint/correctness/useImportExtensions: biome takes the .d.mts types for the module and asks for .mts; the file at runtime is .mjs
  importFFI: () => import("./generated/engine/ffi.mjs").then((module) => module.QuickJSFFI),
  importModuleLoader: async () => {
    // biome-ignore lint/correctness/useImportExtensions: biome takes the .d.mts types for the module and asks for .mts; the file at runtime is .mjs
    const { default: loadGlue } = await import("./generated/engine/quickjs.mjs");
    const loadWithOurMemory: typeof loadGlue = (options) => {
      if (options?.wasmMemory === undefined) {
        throw new Error("the ToolScript engine only runs in a memory the host gives it");
      }
      return loadGlue(options);
    };
    return loadWithOurMemory;
  },
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
  // biome-ignore lint/correctness/useImportExtensions: biome takes the .d.mts types for the module and asks for .mts; the file at runtime is .mjs
  const { default: base64 } = await import("./generated/engine/quickjs-wasm.mjs");
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) bytes[index] = text.charCodeAt(index);
  return WebAssembly.compile(bytes);
}
