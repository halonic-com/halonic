import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ShellError } from "../shell-error.ts";
import { readResourceReport } from "./resource-report.ts";

const sent = {
  engineMemoryBytes: 182_452_224,
  childProcesses: [{ name: "sandbox", memoryBytes: 64_000_000 }],
  dataBytes: 734_003_200,
  freeDiskBytes: 51_539_607_552,
  loadedModels: [
    { name: "llama3.2:3b", sizeBytes: 3_400_000_000, gpuBytes: 3_400_000_000 },
    { name: "nomic-embed-text", sizeBytes: 600_000_000 },
  ],
};

verifies("shell.resource-numbers", () => {
  it("reads every number the engine reports", () => {
    expect(readResourceReport(sent)).toEqual(sent);
  });

  it("keeps an Ollama that didn't answer apart from one with no models", () => {
    const { loadedModels: _, ...withoutOllama } = sent;
    expect(readResourceReport(withoutOllama).loadedModels).toBeUndefined();
    expect(readResourceReport({ ...sent, loadedModels: null }).loadedModels).toBeUndefined();
    expect(readResourceReport({ ...sent, loadedModels: [] }).loadedModels).toEqual([]);
  });

  it.each([
    ["not an object", "full"],
    [[], "the report"],
    [{ ...sent, engineMemoryBytes: -1 }, "engineMemoryBytes"],
    [{ ...sent, freeDiskBytes: Number.NaN }, "freeDiskBytes"],
    [{ ...sent, dataBytes: "734 MB" }, "dataBytes"],
    [{ ...sent, childProcesses: {} }, "childProcesses is not a list"],
    [{ ...sent, childProcesses: [null] }, "childProcesses[0]"],
    [{ ...sent, childProcesses: [{ name: "", memoryBytes: 1 }] }, "name"],
    [{ ...sent, loadedModels: [{ name: "m", sizeBytes: 1, gpuBytes: -1 }] }, "gpuBytes"],
  ])("refuses a report it can't read: %j", (value, where) => {
    expect(() => readResourceReport(value)).toThrow(ShellError);
    expect(() => readResourceReport(value)).toThrow(where === "full" ? "the report" : where);
  });
});
