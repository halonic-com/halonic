/**
 * Which areas are failing on main, for the nightly in `scheduled.yml`. It
 * reads the area table in `docs/guides/area-owners.md`, maps each failed
 * job of the newest finished push run on main to an area, and marks the
 * jobs that also failed on the run from the night before.
 */

export interface Area {
  readonly name: string;
  readonly owner: string;
  /** Path prefixes; one ending in `/` covers everything under it. */
  readonly paths: readonly string[];
}

export interface AreaTable {
  /** In the table's order: a file belongs to the first area that matches it. */
  readonly areas: readonly Area[];
  /** Job name, as the table writes it, to the area it belongs to. */
  readonly jobs: ReadonlyMap<string, string>;
}

/** The jobs that test every package; a failure goes to the failing package's area. */
export const everyPackageJobs: readonly string[] = [
  "Typecheck, lint, test, build",
  "Merge base's tests (no cache)",
];

/** Whether a job tests every package: one of `everyPackageJobs`, or a matrix shard of one. */
export function testsEveryPackage(name: string): boolean {
  return everyPackageJobs.some((job) => name === job || name.startsWith(`${job} (`));
}

/** The area for anything no other row covers. */
export const fallbackArea = "Shared code and everything else";

export interface Job {
  readonly id: number;
  readonly name: string;
  readonly conclusion: string | null;
  readonly url: string;
}

export interface Run {
  readonly url: string;
  readonly jobs: readonly Job[];
}

export interface JobFailure {
  readonly job: string;
  readonly url: string;
  /** The same job failed in the same area on the run from the night before. */
  readonly secondNight: boolean;
}

export interface AreaReport {
  readonly area: string;
  readonly owner: string;
  /** For the `nightly:<slug>` label. */
  readonly slug: string;
  readonly failures: readonly JobFailure[];
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** The body rows of the first table under `## <heading>`. */
function tableRows(markdown: string, heading: string): string[][] {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) {
    throw new Error(`area table: no "## ${heading}" section.`);
  }
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) {
      break;
    }
    if (line.trimStart().startsWith("|")) {
      inTable = true;
      rows.push(cells(line));
    } else if (inTable) {
      break;
    }
  }
  // The header row and the delimiter row.
  return rows.slice(2);
}

/** Reads both tables of `docs/guides/area-owners.md`. */
export function parseAreaTable(markdown: string): AreaTable {
  const areas = tableRows(markdown, "Areas").map(([name = "", owner = "", paths = ""]) => ({
    name,
    owner,
    paths: [...paths.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string),
  }));
  const names = new Set(areas.map((area) => area.name));
  const jobs = new Map<string, string>();
  for (const [area = "", list = "", workflows = ""] of tableRows(markdown, "CI jobs")) {
    if (!names.has(area)) {
      throw new Error(`area table: the CI jobs table names an unknown area "${area}".`);
    }
    for (const job of list.split(/,\s+/).filter((name) => name !== "")) {
      jobs.set(job, area);
    }
    // Another workflow counts as one job, named by its file.
    for (const match of workflows.matchAll(/`([^`]+\.yml)`/g)) {
      jobs.set(match[1] as string, area);
    }
  }
  if (!names.has(fallbackArea)) {
    throw new Error(`area table: no "${fallbackArea}" row.`);
  }
  return { areas, jobs };
}

/** A table path as a pattern: `*` stands for part of one name, a final `/` for everything under it. */
function pathPattern(path: string): RegExp {
  const body = path
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${body}${path.endsWith("/") ? "" : "$"}`);
}

/** The area a repo-relative file belongs to: the first row whose paths match. */
export function areaOfPath(file: string, table: AreaTable): string {
  const area = table.areas.find((candidate) =>
    candidate.paths.some((path) => pathPattern(path).test(file)),
  );
  return area?.name ?? fallbackArea;
}

/**
 * The area of a job, by its name in the table. A matrix job such as
 * "Agent host executable (macOS)" matches the row "Agent host executable".
 */
export function areaOfJob(job: string, table: AreaTable): string | undefined {
  for (const [name, area] of table.jobs) {
    if (job === name || job.startsWith(`${name} (`)) {
      return area;
    }
  }
  return undefined;
}

/**
 * The folders of the packages whose task failed, from a turbo log: each
 * failed task prints `command (<folder>) … exited (<code>)`.
 */
export function failedFolders(log: string): string[] {
  const folders = new Set<string>();
  for (const match of log.matchAll(/command \(([^)]*)\)[^\n]* exited \(\d+\)/g)) {
    const inRepo = /(?:^|\/)((?:apps|packages|tooling|examples)\/.+)$/.exec(match[1] as string);
    if (inRepo?.[1] !== undefined) {
      folders.add(inRepo[1]);
    }
  }
  return [...folders].sort();
}

const failed = new Set(["failure", "timed_out"]);

/** The areas a failed job counts against: a job that tests every package can fail in several. */
function areasOfFailedJob(job: Job, table: AreaTable, logs: ReadonlyMap<number, string>): string[] {
  // ci-ok only repeats the others.
  if (job.name === "ci-ok") {
    return [];
  }
  if (!testsEveryPackage(job.name)) {
    // A job the table doesn't name goes to the shared-code area.
    return [areaOfJob(job.name, table) ?? fallbackArea];
  }
  const areas = new Set(
    failedFolders(logs.get(job.id) ?? "").map((folder) => areaOfPath(`${folder}/`, table)),
  );
  return areas.size > 0 ? [...areas] : [fallbackArea];
}

function failedJobAreas(
  run: Run,
  table: AreaTable,
  logs: ReadonlyMap<number, string>,
): { job: Job; area: string }[] {
  return run.jobs
    .filter((job) => failed.has(job.conclusion ?? ""))
    .flatMap((job) => areasOfFailedJob(job, table, logs).map((area) => ({ job, area })));
}

export function slugOf(area: string): string {
  return area
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * One report per area, failing or not, so the nightly can close the issue of
 * an area that is green again. `earlier` is the run from the night before.
 */
export function areaReports(options: {
  table: AreaTable;
  latest: Run;
  earlier?: Run | undefined;
  logs: ReadonlyMap<number, string>;
}): AreaReport[] {
  const { table, latest, earlier, logs } = options;
  const before = new Set(
    earlier === undefined
      ? []
      : failedJobAreas(earlier, table, logs).map(({ job, area }) => `${area}\0${job.name}`),
  );
  const failures = new Map<string, JobFailure[]>();
  for (const { job, area } of failedJobAreas(latest, table, logs)) {
    const list = failures.get(area) ?? [];
    list.push({ job: job.name, url: job.url, secondNight: before.has(`${area}\0${job.name}`) });
    failures.set(area, list);
  }
  return table.areas.map((area) => ({
    area: area.name,
    owner: area.owner,
    slug: slugOf(area.name),
    failures: failures.get(area.name) ?? [],
  }));
}

/** The issue text for a failing area. */
export function issueBody(report: AreaReport, runUrl: string): string {
  const paused = report.failures.some((failure) => failure.secondNight);
  return [
    `Failing on main in **${report.area}**. Owner: ${report.owner}.`,
    "",
    `Run: ${runUrl}`,
    "",
    ...report.failures.map(
      (failure) =>
        `- [${failure.job}](${failure.url})${failure.secondNight ? " (second night in a row)" : ""}`,
    ),
    "",
    paused
      ? "A job failed two nights in a row, so this area's merges pause until it's fixed (docs/guides/area-owners.md)."
      : "The owner fixes or reverts within 2 hours of the task being created (docs/guides/area-owners.md).",
  ].join("\n");
}
