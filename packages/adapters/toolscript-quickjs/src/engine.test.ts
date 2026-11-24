import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { toolScriptDefaultLimits } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import { expect, it } from "vitest";
import { engineForRun, moduleMemoryBytes } from "./engine.ts";
import QuickJSRaw from "./generated/engine/quickjs.mjs";
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
    const engine = await QuickJSRaw();
    const version = engine.cwrap("QTS_GetEngineVersion", "string", [])();
    expect(version).toBe(sources.quickjsNg.version);
    const [major = 0, minor = 0] = versionParts(String(version));
    expect(major > 0 || minor >= 13).toBe(true);
  });

  it("loads exactly the committed quickjs.wasm", async () => {
    const { default: base64 } = await import("./generated/engine/quickjs-wasm.mjs");
    const committed = readFileSync(new URL("./generated/engine/quickjs.wasm", import.meta.url));
    expect(Buffer.from(base64, "base64").equals(committed)).toBe(true);
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
