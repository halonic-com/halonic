import { ShellError } from "../shell-error.ts";

/** One process the engine started, such as a harness, a sandbox or an MCP server. */
export interface ChildProcessUsage {
  readonly name: string;
  readonly memoryBytes: number;
}

/** A local model that Ollama has loaded, from its `/api/ps`. */
export interface LoadedModel {
  readonly name: string;
  /** The memory the model takes. */
  readonly sizeBytes: number;
  /** The part of it on the graphics card, when Ollama says. */
  readonly gpuBytes?: number;
}

/**
 * What the engine uses, as its resource report gives it (failure-path guide,
 * rule 3). Token use and cost stay in the run summary.
 */
export interface EngineResourceReport {
  /** The engine's own memory. */
  readonly engineMemoryBytes: number;
  readonly childProcesses: readonly ChildProcessUsage[];
  /** The disk space Halonic's data uses: run logs, caches and downloads. */
  readonly dataBytes: number;
  /** The free space on the drive that holds the data folder. */
  readonly freeDiskBytes: number;
  /**
   * The local models Ollama has loaded; `undefined` when Ollama didn't
   * answer, which is not the same as none loaded.
   */
  readonly loadedModels?: readonly LoadedModel[];
}

/**
 * Reads the engine's resource report from what crossed the bridge. A report
 * the shell can't read throws instead of showing made-up numbers.
 *
 * @throws ShellError when a number is missing, negative or not finite, or a list isn't one
 */
export function readResourceReport(value: unknown): EngineResourceReport {
  const report = record(value, "the report");
  const base = {
    engineMemoryBytes: bytes(report, "engineMemoryBytes"),
    childProcesses: list(report["childProcesses"], "childProcesses").map((entry, index) => {
      const child = record(entry, `childProcesses[${index}]`);
      return { name: text(child, "name"), memoryBytes: bytes(child, "memoryBytes") };
    }),
    dataBytes: bytes(report, "dataBytes"),
    freeDiskBytes: bytes(report, "freeDiskBytes"),
  };
  if (report["loadedModels"] === undefined || report["loadedModels"] === null) {
    return base;
  }
  const loadedModels = list(report["loadedModels"], "loadedModels").map((entry, index) => {
    const model = record(entry, `loadedModels[${index}]`);
    const loaded = { name: text(model, "name"), sizeBytes: bytes(model, "sizeBytes") };
    return model["gpuBytes"] === undefined
      ? loaded
      : { ...loaded, gpuBytes: bytes(model, "gpuBytes") };
  });
  return { ...base, loadedModels };
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ShellError(
      `The engine's resource report is not readable: ${where} is not an object.`,
    );
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new ShellError(`The engine's resource report is not readable: ${where} is not a list.`);
  }
  return value;
}

function bytes(owner: Record<string, unknown>, key: string): number {
  const value = owner[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ShellError(
      `The engine's resource report is not readable: ${key} is not a number of bytes.`,
    );
  }
  return value;
}

function text(owner: Record<string, unknown>, key: string): string {
  const value = owner[key];
  if (typeof value !== "string" || value === "") {
    throw new ShellError(`The engine's resource report is not readable: ${key} is not a name.`);
  }
  return value;
}
