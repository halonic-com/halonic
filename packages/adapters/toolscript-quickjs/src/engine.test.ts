import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import { expect, it } from "vitest";
import { engineForRun, moduleMemoryBytes } from "./engine.ts";
// biome-ignore lint/correctness/useImportExtensions: biome takes the .d.mts types for the module and asks for .mts; the file at runtime is .mjs
import type QuickJSRaw from "./generated/engine/quickjs.mjs";
import { createQuickJsToolScriptIsolate } from "./index.ts";

const engineFolder = new URL("../engine/", import.meta.url);
const sha256 = /^[0-9a-f]{64}$/;

interface EngineSources {
  readonly quickjsNg: {
    readonly version: string;
    readonly tag: string;
    readonly commit: string;
    readonly amalgam: { readonly url: string; readonly sha256: string };
  };
  readonly wrapper: { readonly tag: string; readonly commit: string };
  readonly emsdk: { readonly version: string; readonly image: string };
  readonly files: Readonly<Record<string, { readonly from: string; readonly sha256: string }>>;
  readonly build: { readonly moduleMemoryBytes: number; readonly shadowStackBytes: number };
}

const sources = JSON.parse(
  readFileSync(new URL("SOURCES.json", engineFolder), "utf8"),
) as EngineSources;

function hashOf(file: URL): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** A script heap for the tests that make an engine by hand. */
const heapBytes = 4 * 1024 * 1024;

function versionParts(version: string): number[] {
  return version.split(".").map(Number);
}

verifies("toolscript-quickjs.engine", () => {
  it("pins every source by a full sha256, the image by digest and never a bare tag", () => {
    expect(sources.quickjsNg.amalgam.url).toBe(
      `https://github.com/quickjs-ng/quickjs/releases/download/${sources.quickjsNg.tag}/quickjs-amalgam.zip`,
    );
    expect(sources.quickjsNg.amalgam.sha256).toMatch(sha256);
    expect(sources.quickjsNg.tag).toBe(`v${sources.quickjsNg.version}`);
    expect(sources.quickjsNg.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sources.wrapper.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(sources.emsdk.image).toMatch(
      new RegExp(
        `^emscripten/emsdk:${sources.emsdk.version.replaceAll(".", "\\.")}@sha256:[0-9a-f]{64}$`,
      ),
    );
  });

  it("has exactly the pinned upstream files", () => {
    for (const [file, pin] of Object.entries(sources.files)) {
      expect(pin.sha256, file).toMatch(sha256);
      expect(hashOf(new URL(file, engineFolder)), file).toBe(pin.sha256);
    }
  });

  it("exports every function the wrapper's FFI calls, and the engine's version", () => {
    const ffi = readFileSync(new URL("upstream/ffi.mjs", engineFolder), "utf8");
    const called = [...ffi.matchAll(/cwrap\("(QTS_\w+)"/g)].map(([, name]) => `_${name}`);
    const symbols = JSON.parse(readFileSync(new URL("symbols.json", engineFolder), "utf8"));
    expect(symbols).toEqual([...called, "_QTS_GetEngineVersion", "_malloc", "_free"]);
  });

  it("reports the pinned quickjs-ng version, 0.13.0 or later, from the engine itself", async () => {
    // The glue is built for web and worker only, so it never loads the .wasm
    // itself: the run's variant hands it the compiled module and a memory.
    // Our variant's loader is always the glue's own function (src/engine.ts).
    const loadEngine = (await engineForRun(
      heapBytes,
    ).variant.importModuleLoader()) as typeof QuickJSRaw;
    const engine = await loadEngine();
    const version = engine.cwrap("QTS_GetEngineVersion", "string", [])();
    expect(version).toBe(sources.quickjsNg.version);
    const [major = 0, minor = 0] = versionParts(String(version));
    expect(major > 0 || minor >= 13).toBe(true);
  });

  it("ships the engine as base64 that decodes to a valid WebAssembly module", async () => {
    // biome-ignore lint/correctness/useImportExtensions: biome takes the .d.mts types for the module and asks for .mts; the file at runtime is .mjs
    const { default: base64 } = await import("./generated/engine/quickjs-wasm.mjs");
    const bytes = Buffer.from(base64, "base64");
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    await expect(WebAssembly.compile(bytes)).resolves.toBeInstanceOf(WebAssembly.Module);
  });

  it("gives every run the engine's own memory plus its heap, and it can't grow", async () => {
    expect(sources.build.moduleMemoryBytes).toBe(moduleMemoryBytes);
    expect(moduleMemoryBytes).toBeGreaterThan(sources.build.shadowStackBytes);
    const { memory } = engineForRun(heapBytes);
    expect(memory.buffer.byteLength).toBe(moduleMemoryBytes + heapBytes);
    expect(() => memory.grow(1)).toThrow(RangeError);
  });

  it("gives a script that fills the whole memory an out-of-memory error, not a trap", async () => {
    const { variant, memory } = engineForRun(heapBytes);
    const module = await newQuickJSWASMModuleFromVariant(variant);
    // QuickJS's own limit off, so only the fixed memory stops the script.
    const runtime = module.newRuntime({ memoryLimitBytes: -1 });
    const vm = runtime.newContext();
    const result = vm.evalCode(
      "const kept = []; for (;;) kept.push('x'.repeat(1 << 20) + kept.length);",
    );
    expect(result.error).toBeDefined();
    const thrown = vm.dump(result.error ?? vm.undefined);
    expect(String(thrown?.message ?? thrown)).toMatch(/out of memory/i);
    result.error?.dispose();
    expect(memory.buffer.byteLength).toBe(moduleMemoryBytes + heapBytes);
  });

  it("ends a script past its memoryBytes with limit.memory, inside the fixed memory", async () => {
    const limits = { ...toolScriptDefaultLimits.user, memoryBytes: 4 * 1024 * 1024 };
    const result = await createQuickJsToolScriptIsolate({ limits }).run({
      runId: "acme-run",
      code: "export function run() { const kept = []; for (;;) kept.push('x'.repeat(1 << 16) + kept.length); }",
      input: null,
      functions: {},
      limits,
    });
    expect(result).toMatchObject({ ok: false, reason: "limit.memory" });
  });
});
