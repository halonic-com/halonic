/** What one run's `halonic-click-test` artifact holds, as the evidence needs it. */
export interface ClickTestRun {
  /** The run's page on GitHub. */
  readonly url: string;
  /** The repository the run was read from, as `owner/name`. */
  readonly repository: string;
  /** The workflow file that ran, such as `.github/workflows/studio-preview.yml`. */
  readonly path: string;
  /** The repository the run's code came from: a fork's pull request names the fork. */
  readonly headRepository: string;
  /** What started the run, such as `push` or `workflow_dispatch`. */
  readonly event: string;
  /** The run's `results.md`: the pass/fail table. */
  readonly table: string;
  /** The step screenshots, by file name, such as `01-engine-answers.png`. */
  readonly screenshots: readonly Screenshot[];
}

/** One step's screenshot. */
export interface Screenshot {
  readonly name: string;
  readonly png: Uint8Array;
}

/** Reads a click-test run from GitHub. */
export interface ClickTestRunReader {
  read(runId: string): Promise<ClickTestRun>;
}

/** Where the evidence goes: a Paperclip task's attachments and comments. */
export interface EvidenceTarget {
  /** Attaches the file to the task and returns the address that opens it. */
  attach(task: string, screenshot: Screenshot): Promise<string>;
  comment(task: string, body: string): Promise<void>;
}

/**
 * The workflow whose runs hold click-test evidence. A name can be copied, so a run counts only by
 * its workflow file, in the repository itself, started by a push or by hand, the way the installer
 * lookup in that workflow trusts an artifact: a fork's pull request could otherwise upload a
 * crafted `halonic-click-test` that an agent's key then posts (Liam, HAL-18354 review).
 */
export const clickTestWorkflow = ".github/workflows/studio-preview.yml";
const trustedEvents: readonly string[] = ["push", "workflow_dispatch"];

/** A screenshot name the click test's runner writes; anything else in the artifact isn't posted. */
const screenshotName = /^\d{2}-[a-z0-9-]+\.png$/;

/**
 * Posts one click-test run's table on a Paperclip task, with each screenshot
 * attached to the task and linked from its row (HAL-18354). The agent runs
 * it, so CI never holds a Paperclip credential. Returns the comment posted.
 */
export async function postClickTestEvidence(
  runId: string,
  task: string,
  github: ClickTestRunReader,
  paperclip: EvidenceTarget,
): Promise<string> {
  if (!/^\d+$/.test(runId)) throw new Error(`"${runId}" isn't a GitHub run id`);
  const run = await github.read(runId);
  const untrusted = whyUntrusted(run);
  if (untrusted !== undefined) throw new Error(`run ${runId} ${untrusted}`);
  if (run.table.trim() === "") throw new Error(`run ${runId} has no results table`);
  let table = run.table;
  for (const screenshot of run.screenshots) {
    if (!screenshotName.test(screenshot.name)) continue;
    const address = await paperclip.attach(task, screenshot);
    table = table.replaceAll(`| ${screenshot.name} |`, `| [${screenshot.name}](${address}) |`);
  }
  const body = `${table.trimEnd()}\n\nFrom [run ${runId}](${run.url}).\n`;
  await paperclip.comment(task, body);
  return body;
}

// Why the run's artifact can't be trusted, or undefined when it can.
function whyUntrusted(run: ClickTestRun): string | undefined {
  if (run.path !== clickTestWorkflow) return `ran ${run.path}, not ${clickTestWorkflow}`;
  if (run.headRepository !== run.repository) {
    return `ran code from ${run.headRepository}, not ${run.repository}`;
  }
  if (!trustedEvents.includes(run.event))
    return `was started by ${run.event}, not a push or by hand`;
  return undefined;
}
