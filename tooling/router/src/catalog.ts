import { type FileProblem, type ModelAlias, parseFile } from "@halonicjs/format";
import { formatPath, parse } from "@halonicjs/schema-kit";
import { err, ok, type Result } from "@halonicjs/std";
import { readYaml } from "@halonicjs/yaml";
import { crossCheck } from "./catalog-checks.ts";
import { priceVersionOf } from "./price-version.ts";
import { type AliasStatus, type DataClass, RouterExtension } from "./router-extension.ts";

/** The catalog's two files, by the name the problems use. */
export const catalogFileNames = {
  models: "providers.yaml",
  router: "providers.router.yaml",
} as const;

/** Which of the catalog's two files a problem is in. */
export type CatalogFile = (typeof catalogFileNames)[keyof typeof catalogFileNames];

/** Something wrong with the catalog, and where. */
export interface CatalogProblem {
  readonly file: CatalogFile;
  /** The keys to the value, such as `aliases.opus.price`; empty for the whole file. */
  readonly path: string;
  readonly message: string;
  /** 1-based line of the value, when the file could be read. */
  readonly line?: number;
}

/** One alias the router may know: the `models.yaml` alias and the router's fields for it. */
export interface CatalogEntry {
  readonly name: string;
  readonly alias: ModelAlias;
  readonly dataClass: DataClass;
  readonly status: AliasStatus;
  readonly pinnedHost?: string | undefined;
}

/** The provider catalog, checked as a whole. */
export interface ProviderCatalog {
  readonly entries: ReadonlyMap<string, CatalogEntry>;
  /**
   * A hash of every alias's provider, model and price (Q4). Each cost row
   * stores it, so a price change doesn't move older cost-per-pass numbers.
   */
  readonly priceVersion: string;
}

/** The text of the catalog's two files. */
export interface CatalogTexts {
  /** `providers.yaml`, a plain `models.yaml`. */
  readonly models: string;
  /** `providers.router.yaml`, the router's fields per alias. */
  readonly router: string;
}

/**
 * Reads and checks the provider catalog: `providers.yaml` with the workspace
 * format's own `models.yaml` schema, `providers.router.yaml` with the router's
 * extension, then the rules across both.
 *
 * @example
 * const catalog = loadCatalog({ models, router });
 * if (!catalog.ok) for (const problem of catalog.error) report(problem);
 */
export function loadCatalog(texts: CatalogTexts): Result<ProviderCatalog, CatalogProblem[]> {
  const models = parseFile("models", texts.models);
  const router = readRouterExtension(texts.router);
  const problems: CatalogProblem[] = [
    ...(models.ok ? [] : models.error.map(modelsProblem)),
    ...(router.ok ? [] : router.error),
  ];
  if (!models.ok || !router.ok) {
    return err(problems);
  }
  const aliases = models.value.value.aliases;
  const fields = router.value.aliases;
  const crossProblems = crossCheck(aliases, fields);
  if (crossProblems.length > 0) {
    return err(crossProblems);
  }
  const entries = new Map<string, CatalogEntry>();
  for (const [name, alias] of Object.entries(aliases)) {
    const extension = fields[name];
    if (extension !== undefined) {
      entries.set(name, { name, alias, ...extension });
    }
  }
  return ok({ entries, priceVersion: priceVersionOf(aliases) });
}

function readRouterExtension(text: string): Result<RouterExtension, CatalogProblem[]> {
  const file = catalogFileNames.router;
  const read = readYaml(text);
  if (!read.ok) {
    return err([{ file, path: "", message: read.error.message, line: read.error.line }]);
  }
  const parsed = parse(RouterExtension, read.value.data);
  if (!parsed.ok) {
    return err(
      parsed.error.map((issue) => {
        const position = read.value.positionOf(issue.path);
        const problem = { file, path: formatPath(issue.path), message: issue.message };
        return position === undefined ? problem : { ...problem, line: position.line };
      }),
    );
  }
  return ok(parsed.value);
}

function modelsProblem(problem: FileProblem): CatalogProblem {
  return {
    file: catalogFileNames.models,
    path: formatPath(problem.path),
    message: problem.message,
    line: problem.line,
  };
}
