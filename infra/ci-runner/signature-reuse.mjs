// Whether a pull request's push only signed its decision note (HAL-17896), so its CI run can
// reuse the previous head's build and test results instead of running everything again. ci.yml's
// `signature-reuse` job runs this on a `synchronize` push and answers `run=<id>` only when:
//
// - the push is one commit on top of the previous head (its only parent is `before`), and it
//   changes exactly `decisions/<head ref>.md`, where every added or removed line is a
//   `- Signature: ed25519:` line: a first signature, a guardian's second or a replaced one;
// - the newest completed CI run of `before` ran in full (a `ci-ok` job by that name, so not a
//   draft's light run or a label's empty run) and every job in its latest attempt passed or
//   skipped, apart from ci-ok, the fail-fast watcher and the requirement guard's two jobs, which a
//   missing signature fails;
// - the run whose results are reused still has every shard's test results and the merge base's
//   archive, and its merge base's tests job reported them (the MERGE_BASE_TITLE notice).
//
// When `before`'s run was itself such a reuse, the answer is the run it reused, so a second
// guardian's line reuses the same results. Every doubt answers a full run, and it never fails the
// job. The signature doesn't cover the head commit, only the note without its signature lines and
// the covered files' git objects (docs/guides/checks.md), so a signature-only push changes nothing
// the build or the tests read.
//
// This is not a trust boundary: a pull request runs its own copy of ci.yml and of this file. The
// merge queue still runs every job, and guard-notes.yml checks the note from the base's code.
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
const MAX_PAGES = 5;
const TIMEOUT_MS = 10_000;
const SHA = /^[0-9a-f]{40}$/;
const SIGNATURE_LINE = /^[+-]- Signature: ed25519:/;

/** The notice the job writes when it reuses a run; a later push reads `run=<id>` from it. */
export const REUSE_TITLE = "Signature-only push";
/** The notice ci.yml's merge base's tests job writes with its outputs. */
export const MERGE_BASE_TITLE = "Merge base's results";
/** Jobs of the previous run that may have failed: the missing signature fails them. */
export const MAY_FAIL = [
  "ci-ok",
  "Cancel the run on the first failure",
  "Requirement guard, file checks (merge base's copy)",
  "Requirements and the requirement guard (merge base's copy)",
];
/** The merge base's tests job, whose notice holds its outputs. */
export const BASE_TESTS_JOB = "Merge base's tests (no cache)";
const LABEL_RUN_TITLE = "A label was added: nothing to run";

const full = (why) => ({ reuse: false, why });

/** Whether `compare` (GitHub's compare of `before...after`) is one commit that only signs `note`. */
export function checkPush({ compare, before, after, note }) {
  if (compare?.status !== "ahead" || compare.ahead_by !== 1 || compare.behind_by !== 0) {
    return full(`${after.slice(0, 7)} isn't one commit on top of ${before.slice(0, 7)}`);
  }
  const commit = compare.commits?.[0];
  const parents = (commit?.parents ?? []).map((parent) => parent?.sha);
  if (commit?.sha !== after || parents.length !== 1 || parents[0] !== before) {
    return full(`the new head's only parent isn't ${before.slice(0, 7)} (a rebase or a merge)`);
  }
  const files = Array.isArray(compare.files) ? compare.files : [];
  if (files.length !== 1 || files[0]?.filename !== note || files[0].status !== "modified") {
    const names = files.map((file) => file?.filename).join(", ");
    return full(`the push changes ${names || "no file"}, not only ${note}`);
  }
  if (typeof files[0].patch !== "string") return full(`GitHub gave no diff of ${note}`);
  const changed = files[0].patch.split("\n").filter((line) => /^[+-]/.test(line));
  const other = changed.find((line) => !SIGNATURE_LINE.test(line));
  if (changed.length === 0 || other !== undefined) {
    return full(`${note} changes more than its signature lines`);
  }
  return { reuse: true };
}

/** Whether a run's latest attempt ran in full and every job passed, bar the ones in MAY_FAIL. */
export function checkJobs(jobs) {
  if (!jobs.some((job) => job?.name === "ci-ok")) {
    return full("it has no ci-ok job by that name (a draft's light run or a label's run)");
  }
  const bad = jobs.filter(
    (job) =>
      !MAY_FAIL.includes(job?.name) &&
      job?.conclusion !== "success" &&
      job?.conclusion !== "skipped",
  );
  if (bad.length > 0) {
    return full(
      `its job ${bad.map((job) => `${job?.name} (${job?.conclusion})`).join(", ")} didn't pass`,
    );
  }
  return { reuse: true };
}

/** The merge base's outputs from MERGE_BASE_TITLE's message, or null when they're incomplete. */
export function parseMergeBase(message) {
  const fields = Object.fromEntries(
    String(message ?? "")
      .split(/\s+/)
      .map((word) => word.split("="))
      .filter((pair) => pair.length === 2),
  );
  const result = {
    sha: fields.sha,
    builtOn: fields["built-on"],
    resultsId: fields["results-id"],
    resultsSha256: fields["results-sha256"],
  };
  if (!SHA.test(result.sha ?? "") || !SHA.test(result.builtOn ?? "")) return null;
  if (
    !/^[0-9]+$/.test(result.resultsId ?? "") ||
    !/^[0-9a-f]{64}$/.test(result.resultsSha256 ?? "")
  ) {
    return null;
  }
  return result;
}

/** The run a REUSE_TITLE notice names, or null. */
export function parseReuse(message) {
  const match = /\brun=([0-9]+)\b/.exec(String(message ?? ""));
  return match ? match[1] : null;
}

/** One GET on the REST API, its JSON body, or an error for any status but 200. */
async function get(fetchImpl, token, url) {
  const response = await fetchImpl(url.startsWith("https://") ? url : `${API}${url}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`GitHub answered ${response.status} for ${url}`);
  return response.json();
}

/** Every page of a list endpoint, read as `key`, up to MAX_PAGES pages of 100. */
async function getAll(api, path, key) {
  const items = [];
  const join = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const list = (await api(`${path}${join}per_page=100&page=${page}`))?.[key];
    if (!Array.isArray(list)) throw new Error(`no ${key} list in the answer for ${path}`);
    items.push(...list);
    if (list.length < 100) return items;
  }
  throw new Error(`more than ${MAX_PAGES} pages for ${path}`);
}

/** The newest completed CI run of `sha` on this pull request's branch, other than `current`. */
async function previousRun(api, { repo, sha, headRef, current }) {
  const path = `/repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${sha}`;
  const runs = (await getAll(api, path, "workflow_runs")).filter(
    (run) =>
      run?.head_sha === sha &&
      run.head_branch === headRef &&
      run.status === "completed" &&
      run.display_title !== LABEL_RUN_TITLE &&
      String(run.id) !== String(current),
  );
  runs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return runs[0] ?? null;
}

/** The text of the notices a job wrote under `title`. */
async function notices(api, job, title) {
  if (typeof job?.check_run_url !== "string") return [];
  const annotations = await api(`${job.check_run_url}/annotations?per_page=100`);
  if (!Array.isArray(annotations)) throw new Error(`no annotations for ${job.name}`);
  return annotations.filter((note) => note?.title === title).map((note) => note.message);
}

/** A run's jobs in its latest attempt, checked by checkJobs. */
async function jobsOf(api, repo, runId) {
  return getAll(api, `/repos/${repo}/actions/runs/${runId}/jobs?filter=latest`, "jobs");
}

/** Whether `run` still has every shard's results and, with `base`, the merge base's archive. */
async function checkArtifacts(api, { repo, runId, shards, base }) {
  const artifacts = await getAll(
    api,
    `/repos/${repo}/actions/runs/${runId}/artifacts`,
    "artifacts",
  );
  const live = (match) =>
    artifacts.some((artifact) => match(artifact) && artifact.expired === false);
  const missing = shards.filter(
    (shard) => !live((artifact) => artifact?.name === `test-results-${shard}`),
  );
  if (base && !live((artifact) => String(artifact?.id) === base.resultsId))
    missing.push("merge base");
  if (missing.length > 0) return full(`run ${runId}'s results for ${missing.join(", ")} are gone`);
  return { reuse: true };
}

/** The settings that answer a full run before anything is asked, or null when none does. */
function refuseEarly(env) {
  if (env.SWITCH === "off") return full("CI_PR_SIGNATURE_REUSE is off");
  if (env.ATTEMPT !== "1") return full(`this is a re-run (attempt ${env.ATTEMPT})`);
  if (env.DRAFT === "true") return full("the pull request is a draft");
  if (!SHA.test(env.BEFORE ?? "") || /^0+$/.test(env.BEFORE))
    return full("the push has no previous head");
  if (!SHA.test(env.AFTER ?? "")) return full("the push has no new head");
  if (
    !/^[A-Za-z0-9._/-]+$/.test(env.HEAD_REF ?? "") ||
    !/^[\w.-]+\/[\w.-]+$/.test(env.REPO ?? "")
  ) {
    return full("the branch or the repository is missing");
  }
  if (!env.GH_TOKEN) return full("there is no token to read the previous run");
  return null;
}

/** Reads the settings from `env`, asks GitHub, decides. */
export async function decide({ env, fetchImpl }) {
  const early = refuseEarly(env);
  if (early) return early;
  const api = (url) => get(fetchImpl, env.GH_TOKEN, url);
  const { REPO: repo, BEFORE: before, AFTER: after, HEAD_REF: headRef } = env;
  const shards = String(env.BUILD_SHARDS ?? "")
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
  if (shards.length === 0) return full("BUILD_SHARDS names no shard");

  const compare = await api(`/repos/${repo}/compare/${before}...${after}`);
  const push = checkPush({ compare, before, after, note: `decisions/${headRef}.md` });
  if (!push.reuse) return push;

  const previous = await previousRun(api, { repo, sha: before, headRef, current: env.RUN_ID });
  if (!previous) return full(`${before.slice(0, 7)} has no completed CI run`);
  const previousJobs = await jobsOf(api, repo, previous.id);
  const ran = checkJobs(previousJobs);
  if (!ran.reuse) return full(`run ${previous.id} can't be reused: ${ran.why}`);

  // A previous run that reused another one points at the run that has the results.
  let source = previous.id;
  let sourceJobs = previousJobs;
  const reuseJob = previousJobs.find(
    (job) => job?.name === REUSE_TITLE && job.conclusion === "success",
  );
  const earlier = reuseJob
    ? (await notices(api, reuseJob, REUSE_TITLE)).map(parseReuse).find(Boolean)
    : null;
  if (earlier) {
    source = earlier;
    sourceJobs = await jobsOf(api, repo, source);
    const sourceRan = checkJobs(sourceJobs);
    if (!sourceRan.reuse) return full(`run ${source} can't be reused: ${sourceRan.why}`);
  }

  const baseTests = sourceJobs.find((job) => job?.name === BASE_TESTS_JOB);
  let base = null;
  if (baseTests?.conclusion === "success") {
    base =
      (await notices(api, baseTests, MERGE_BASE_TITLE)).map(parseMergeBase).find(Boolean) ?? null;
    if (!base) return full(`run ${source}'s merge base's tests job didn't report its results`);
  }
  const kept = await checkArtifacts(api, { repo, runId: source, shards, base });
  if (!kept.reuse) return kept;
  return {
    reuse: true,
    run: String(source),
    base,
    why: `only ${`decisions/${headRef}.md`}'s signature lines changed since ${before.slice(0, 7)}`,
  };
}

/** The job's step: decides, writes the outputs and a notice, and never fails. */
export async function main({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let result;
  try {
    result = await decide({ env, fetchImpl });
  } catch (error) {
    result = full(`the check failed: ${error.message}`);
  }
  if (!result.reuse) {
    console.log(`::notice title=Full run::${result.why}, so every job runs.`);
    return result;
  }
  console.log(
    `::notice title=${REUSE_TITLE}::${result.why}, so this run reuses the build and test results of run=${result.run}. The requirement guard runs on the new head.`,
  );
  if (env.GITHUB_OUTPUT) {
    const base = result.base ?? {};
    const lines = [
      `run=${result.run}`,
      `sha=${base.sha ?? ""}`,
      `built-on=${base.builtOn ?? ""}`,
      `results-id=${base.resultsId ?? ""}`,
      `results-sha256=${base.resultsSha256 ?? ""}`,
    ];
    appendFileSync(env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
  return result;
}

// No top-level await, and main never rejects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
