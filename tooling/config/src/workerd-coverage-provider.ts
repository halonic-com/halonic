import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import v8CoverageModule from "@vitest/coverage-v8";
import { V8CoverageProvider } from "@vitest/coverage-v8/dist/provider.js";
import type { CoverageProviderModule, ReportContext, Vitest } from "vitest/node";

/**
 * The environment variable that tells a workerd run where to leave its
 * coverage. `@halonicjs/target-cloudflare-testing` reads it (the same name is
 * in `src/node/workerd-coverage.ts` there): a run without it counts nothing.
 */
export const workerdCoverageDirVariable = "HALONIC_WORKERD_COVERAGE_DIR";

/** What the V8 provider's `convertCoverage` takes: V8 script coverage, and where to read the sources. */
interface V8Converter {
  convertCoverage(
    coverage: { result: unknown[] },
    project: unknown,
    environment: "ssr",
  ): Promise<ReturnType<V8CoverageProvider["createCoverageMap"]>>;
}

/**
 * Vitest's V8 coverage provider, with the coverage that workerd counted
 * added to the report. Node's V8 coverage can't see code running in workerd,
 * so the workerd suites (`@halonicjs/target-cloudflare-testing`) leave their
 * own, already mapped back to the source files, in a folder next to the
 * report. This converts each file the way Vitest does a Node script, and
 * adds it to the Node run's coverage, so each source file shows what both
 * runs covered.
 *
 * The two are converted apart, not merged as V8 ranges: V8 offsets in Node
 * are into Vite's transformed code, workerd's are into the source file.
 */
class WorkerdCoverageProvider extends V8CoverageProvider {
  #directory = "";

  override initialize(ctx: Vitest): void {
    super.initialize(ctx);
    // `options` is Vitest's resolved `coverage` setting. Workers started from now on inherit the variable.
    this.#directory = join(this["options"].reportsDirectory, ".workerd");
    process.env[workerdCoverageDirVariable] = this.#directory;
  }

  override async generateCoverage(context: ReportContext) {
    const coverageMap = await super.generateCoverage(context);
    const workerdMap = this.createCoverageMap();
    for (const result of await this.#takeWorkerdCoverage()) {
      const converter = this as unknown as V8Converter;
      workerdMap.merge(
        await converter.convertCoverage({ result }, this["ctx"].getRootProject(), "ssr"),
      );
    }
    // A file no Node test loaded is in the Node run's map as an empty stand-in, with a different
    // shape than workerd's. Merged, it would leave a statement that never runs.
    const workerdFiles = new Set(workerdMap.files());
    coverageMap.filter((file) => {
      return (
        !workerdFiles.has(file) || coverageMap.fileCoverageFor(file).toSummary().lines.covered > 0
      );
    });
    coverageMap.merge(workerdMap);
    return coverageMap;
  }

  /** Reads what the workerd runs left, one entry per run, and clears the folder for the next run. */
  async #takeWorkerdCoverage(): Promise<unknown[][]> {
    const names = await readdir(this.#directory).catch(() => []);
    const runs = await Promise.all(
      names
        .filter((name) => name.endsWith(".json"))
        .map(async (name) => {
          const content = await readFile(join(this.#directory, name), "utf8");
          return (JSON.parse(content) as { result: unknown[] }).result;
        }),
    );
    await rm(this.#directory, { recursive: true, force: true });
    await mkdir(this.#directory, { recursive: true });
    return runs;
  }
}

/**
 * The coverage module a package names as its `customProviderModule`: the V8
 * module with the provider above. Vitest calls the module's `startCoverage`
 * and `takeCoverage` in its test workers, and `getProvider` in its main process.
 */
const workerdCoverageModule: CoverageProviderModule = Object.assign(
  Object.create(v8CoverageModule) as CoverageProviderModule,
  { getProvider: () => new WorkerdCoverageProvider() },
);

// biome-ignore lint/style/noDefaultExport: Vitest loads a custom coverage provider from the default export.
export default workerdCoverageModule;
