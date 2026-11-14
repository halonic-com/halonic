import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { SourceMap, type SourceMapPayload } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CoverageRange, FunctionCoverage, RawCoverage } from "../worker/protocol.ts";
import type { CoveredTestWorker } from "./build-test-worker.ts";

/**
 * The environment variable that turns coverage on for workerd runs. The
 * shared Vitest preset sets it for `"runtime": "workers"` packages (the same
 * name is in `tooling/config/src/workerd-coverage-provider.ts`) to the folder
 * the run's workerd coverage goes to, and reads it back when the run ends.
 */
export const workerdCoverageDirVariable = "HALONIC_WORKERD_COVERAGE_DIR";

/**
 * What Miniflare calls the module of a `script` option, which is how V8
 * names it in the coverage.
 */
const workerScriptName = "script-0";

/**
 * One source file's V8 coverage, in offsets into the file's own text, as
 * Vitest's coverage provider takes it.
 */
export interface SourceCoverage {
  readonly scriptId: string;
  readonly url: string;
  readonly startOffset: 0;
  readonly isExtendedContext: true;
  readonly functions: readonly FunctionCoverage[];
}

/** Where each line of a text starts, to go between an offset and a line and column. */
class LineOffsets {
  readonly #lineStarts = [0];
  readonly length: number;

  constructor(text: string) {
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
      this.#lineStarts.push(index + 1);
    }
    this.length = text.length;
  }

  position(offset: number): { line: number; column: number } {
    let low = 0;
    let high = this.#lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.#lineStarts[middle] ?? 0) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return { line: low, column: offset - (this.#lineStarts[low] ?? 0) };
  }

  /** The offset of a line and column, kept on its line when the column is past the line's end. */
  offset(line: number, column: number): number {
    const start = this.#lineStarts[line] ?? this.length;
    const nextStart = this.#lineStarts[line + 1];
    const end = nextStart === undefined ? this.length : nextStart - 1;
    return Math.min(start + column, end);
  }
}

/** A point in a source file, as an offset into its text. */
interface SourcePoint {
  readonly file: string;
  readonly offset: number;
}

/**
 * Finds the source file and offset that a script offset came from, through
 * the build's source map.
 */
class SourceLocator {
  readonly #script: LineOffsets;
  readonly #map: SourceMap;
  readonly #sourceRoot: string;
  readonly #sources: ReadonlyMap<string, LineOffsets>;

  private constructor(
    script: LineOffsets,
    map: SourceMap,
    sourceRoot: string,
    sources: ReadonlyMap<string, LineOffsets>,
  ) {
    this.#script = script;
    this.#map = map;
    this.#sourceRoot = sourceRoot;
    this.#sources = sources;
  }

  static async load(build: CoveredTestWorker): Promise<SourceLocator> {
    const payload = JSON.parse(build.sourceMap) as SourceMapPayload;
    const sources = new Map<string, LineOffsets>();
    for (const source of payload.sources) {
      const file = resolveSource(build.sourceRoot, source);
      if (!file.includes(`${path.sep}node_modules${path.sep}`) && existsSync(file)) {
        sources.set(file, new LineOffsets(await readFile(file, "utf8")));
      }
    }
    return new SourceLocator(
      new LineOffsets(build.script),
      new SourceMap(payload),
      build.sourceRoot,
      sources,
    );
  }

  /** The text of each source file that went into the script and exists on disk. */
  get files(): ReadonlyMap<string, LineOffsets> {
    return this.#sources;
  }

  /**
   * Where the script's character at `offset` came from. The map has a point
   * at the start of each token, so a character inside or after a token is
   * taken to sit as far past the point in the source as it does in the
   * script, which holds while the build copies the token as it is.
   *
   * @returns the source file and offset, or `undefined` when it has no source file
   */
  locate(offset: number): SourcePoint | undefined {
    const { line, column } = this.#script.position(offset);
    const entry = this.#map.findEntry(line, column);
    if (!("originalSource" in entry)) {
      return undefined;
    }
    const file = resolveSource(this.#sourceRoot, entry.originalSource);
    const text = this.#sources.get(file);
    if (text === undefined) {
      return undefined;
    }
    const pastPoint = entry.generatedLine === line ? column - entry.generatedColumn : 0;
    return { file, offset: text.offset(entry.originalLine, entry.originalColumn + pastPoint) };
  }
}

function resolveSource(sourceRoot: string, source: string): string {
  return source.startsWith("file:") ? fileURLToPath(source) : path.resolve(sourceRoot, source);
}

/**
 * Takes what workerd counted in the test Worker's script back to the source
 * files that were bundled into it. A source file's own offsets are the ones
 * Vitest's coverage provider reads, because it strips the types of a `.ts`
 * file without moving a character.
 *
 * A mapped range is as exact as the build's source map: it starts and ends
 * where the map has a point near the script's offset. A range whose ends
 * don't both land in one source file is dropped.
 *
 * @param raw - the coverage from `WorkerdRunner.coverage`
 * @param build - the Worker the coverage came from
 * @returns one entry per source file the Worker ran any code of
 */
export async function mapToSourceFiles(
  raw: RawCoverage,
  build: CoveredTestWorker,
): Promise<SourceCoverage[]> {
  const locator = await SourceLocator.load(build);
  const byFile = new Map<string, FunctionCoverage[]>();
  const script = raw.result.find((entry) => entry.url === workerScriptName);
  const add = (file: string, mapped: FunctionCoverage): void => {
    byFile.set(file, [...(byFile.get(file) ?? []), mapped]);
  };
  for (const fn of script?.functions ?? []) {
    if (isTopLevel(fn)) {
      for (const [file, mapped] of mapTopLevel(fn, locator)) {
        add(file, mapped);
      }
      continue;
    }
    const mapped = mapFunction(fn, locator);
    if (mapped !== undefined) {
      add(mapped.file, mapped.mapped);
    }
  }
  return [...byFile].map(([file, functions], index) => ({
    scriptId: String(index),
    url: pathToFileURL(file).href,
    startOffset: 0,
    isExtendedContext: true,
    functions,
  }));
}

/** The script's own code outside any function: it has no name and starts at the script's start. */
function isTopLevel(fn: FunctionCoverage): boolean {
  return fn.functionName === "" && fn.ranges[0]?.startOffset === 0;
}

/**
 * Maps one function's ranges into the source file the function is in. A
 * function whose ends land in different files, or in none, is dropped.
 */
function mapFunction(
  fn: FunctionCoverage,
  locator: SourceLocator,
): { file: string; mapped: FunctionCoverage } | undefined {
  const [whole, ...inner] = fn.ranges;
  const mappedWhole = whole === undefined ? undefined : mapRange(whole, locator);
  if (mappedWhole === undefined) {
    return undefined;
  }
  const ranges = inner.flatMap((range) => {
    const mapped = mapRange(range, locator);
    return mapped?.file === mappedWhole.file ? [mapped.range] : [];
  });
  return { file: mappedWhole.file, mapped: { ...fn, ranges: nest(mappedWhole.range, ranges) } };
}

/**
 * Maps the script's top-level code, which runs the top-level code of the
 * bundled files one after the other. Each file gets a function of its own,
 * counted as often as the top-level code ran, with the ranges inside it that
 * didn't run: the functions nothing has called yet.
 */
function mapTopLevel(fn: FunctionCoverage, locator: SourceLocator): Map<string, FunctionCoverage> {
  const [whole, ...inner] = fn.ranges;
  const result = new Map<string, FunctionCoverage>();
  if (whole === undefined) {
    return result;
  }
  const innerByFile = new Map<string, CoverageRange[]>();
  for (const range of inner) {
    const mapped = mapRange(range, locator);
    if (mapped !== undefined) {
      innerByFile.set(mapped.file, [...(innerByFile.get(mapped.file) ?? []), mapped.range]);
    }
  }
  for (const [file, text] of locator.files) {
    const topLevel = { startOffset: 0, endOffset: text.length, count: whole.count };
    result.set(file, { ...fn, ranges: nest(topLevel, innerByFile.get(file) ?? []) });
  }
  return result;
}

function mapRange(
  range: CoverageRange,
  locator: SourceLocator,
): { file: string; range: CoverageRange } | undefined {
  const start = locator.locate(range.startOffset);
  const last = locator.locate(range.endOffset - 1);
  if (start === undefined || last === undefined || start.file !== last.file) {
    return undefined;
  }
  const endOffset = last.offset + 1;
  if (endOffset <= start.offset) {
    return undefined;
  }
  return {
    file: start.file,
    range: { startOffset: start.offset, endOffset, count: range.count },
  };
}

/**
 * Puts mapped ranges in V8's order (the whole function first, each range
 * inside the one before it) and trims any that the mapping moved past the
 * range around it, so Vitest's merge accepts them.
 */
function nest(whole: CoverageRange, ranges: readonly CoverageRange[]): CoverageRange[] {
  const sorted = [...ranges].sort(
    (a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset,
  );
  const result = [whole];
  const open = [whole];
  for (const range of sorted) {
    while (open.length > 1 && range.startOffset >= (open.at(-1)?.endOffset ?? 0)) {
      open.pop();
    }
    const parent = open.at(-1) ?? whole;
    const trimmed = {
      startOffset: Math.max(range.startOffset, parent.startOffset),
      endOffset: Math.min(range.endOffset, parent.endOffset),
      count: range.count,
    };
    if (trimmed.endOffset > trimmed.startOffset) {
      result.push(trimmed);
      open.push(trimmed);
    }
  }
  return result;
}

/**
 * Writes one workerd run's coverage into the folder the coverage provider
 * reads at the end of the run.
 *
 * @param directory - the folder from {@link workerdCoverageDirVariable}
 * @param coverage - what {@link mapToSourceFiles} returned
 */
export async function writeWorkerdCoverage(
  directory: string,
  coverage: readonly SourceCoverage[],
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `coverage-${randomUUID()}.json`),
    JSON.stringify({ result: coverage }),
  );
}
