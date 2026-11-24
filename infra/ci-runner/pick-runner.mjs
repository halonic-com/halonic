// Picks where a pull request's Linux jobs run (HAL-17654): on our fast pool only while it has
// room, otherwise on GitHub's runners. ci.yml's `pick-runner` job runs this once, before any of
// those jobs exists, because a job's runner is fixed when GitHub creates it. One answer per run, so
// a run is all ours or all GitHub's.
//
// It counts the runners in CI_RUNNER_FAST's group that carry all of its labels and are online and
// idle. A fast slot registers only when the VM's memory admission lets it, so an idle registered
// runner is a slot that can start a job now. Every doubt answers GitHub, never our pool: no token,
// a failed or odd API answer, an unreadable setting. It never fails the job; ci.yml reads only
// the `fast` output, and a missing output also means GitHub.
//
// This is not the security boundary. The job-started hook on the CI VM still refuses any pull
// request its own config doesn't admit (vm/job-started.sh, PR_SCOPE in vm/pool-fast.conf).
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** CI_FAST_MIN_IDLE when unset: a pull request's run has about 11 Linux jobs, plus a margin. */
export const DEFAULT_MIN_IDLE = 14;
const API = "https://api.github.com";
const MAX_PAGES = 10;
const TIMEOUT_MS = 10_000;

/** Whether the pull request may use the fast pool at all, by CI_FAST_SCOPE and its labels. */
export function inScope(scope, labels) {
  // Only exactly "all" widens it; anything else, unset included, means "fast-track".
  if (scope === "all") return { ok: true, why: 'CI_FAST_SCOPE is "all"' };
  if (Array.isArray(labels) && labels.includes("fast-track")) {
    return { ok: true, why: "the pull request carries fast-track" };
  }
  return {
    ok: false,
    why: "the pull request has no fast-track label (CI_FAST_SCOPE is fast-track)",
  };
}

/** CI_FAST_MIN_IDLE as a whole number from 1 to 100; empty means the default, anything else null. */
export function parseMinIdle(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return DEFAULT_MIN_IDLE;
  if (!/^[1-9][0-9]{0,2}$/.test(text)) return null;
  const value = Number(text);
  return value <= 100 ? value : null;
}

/** CI_RUNNER_FAST's runner group and labels, or null when it isn't a group with labels. */
export function parseTarget(raw) {
  let value;
  try {
    value = JSON.parse(String(raw ?? ""));
  } catch {
    return null;
  }
  if (typeof value?.group !== "string" || value.group === "") return null;
  const labels = value.labels;
  if (!Array.isArray(labels) || labels.length === 0) return null;
  if (!labels.every((label) => typeof label === "string" && label !== "")) return null;
  return { group: value.group, labels };
}

/** How many runners are online, not busy and carry every label in `labels`. */
export function countIdle(runners, labels) {
  return runners.filter((runner) => {
    if (runner?.status !== "online" || runner.busy !== false) return false;
    const names = Array.isArray(runner.labels) ? runner.labels.map((label) => label?.name) : [];
    return labels.every((label) => names.includes(label));
  }).length;
}

/** The decision: `fast` is true only when every input is sound and enough runners are idle. */
export function decide({ scope, labels, minIdle, idle }) {
  const allowed = inScope(scope, labels);
  if (!allowed.ok) return { fast: false, why: allowed.why };
  if (minIdle === null)
    return { fast: false, why: "CI_FAST_MIN_IDLE isn't a number from 1 to 100" };
  if (!Number.isInteger(idle))
    return { fast: false, why: "the fast pool's runners couldn't be read" };
  if (idle < minIdle) {
    return {
      fast: false,
      why: `${idle} fast runners idle, fewer than CI_FAST_MIN_IDLE (${minIdle})`,
    };
  }
  return { fast: true, why: `${idle} fast runners idle, at least CI_FAST_MIN_IDLE (${minIdle})` };
}

/** One GET on the REST API, its JSON body, or an error for any status but 200. */
async function get(fetchImpl, token, path) {
  const response = await fetchImpl(`${API}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`GitHub answered ${response.status} for ${path}`);
  return response.json();
}

/** Every page of a list endpoint, read as `key`, up to MAX_PAGES pages of 100. */
async function getAll(fetchImpl, token, path, key) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const body = await get(fetchImpl, token, `${path}?per_page=100&page=${page}`);
    const list = body?.[key];
    if (!Array.isArray(list)) throw new Error(`no ${key} list in the answer for ${path}`);
    items.push(...list);
    if (list.length < 100) return items;
  }
  throw new Error(`more than ${MAX_PAGES} pages for ${path}`);
}

/** The runners of the organisation's runner group named `group`. */
export async function listGroupRunners({ fetchImpl, token, org, group }) {
  const groups = await getAll(
    fetchImpl,
    token,
    `/orgs/${org}/actions/runner-groups`,
    "runner_groups",
  );
  const match = groups.filter((entry) => entry?.name === group);
  if (match.length !== 1 || !Number.isInteger(match[0].id)) {
    throw new Error(`no single runner group named ${group}`);
  }
  const path = `/orgs/${org}/actions/runner-groups/${match[0].id}/runners`;
  return getAll(fetchImpl, token, path, "runners");
}

/** Reads the settings from `env`, asks GitHub only when the pull request is in scope, decides. */
export async function pick({ env, fetchImpl }) {
  const scope = env.CI_FAST_SCOPE ?? "";
  let labels;
  try {
    labels = JSON.parse(env.PR_LABELS ?? "[]");
  } catch {
    labels = [];
  }
  const minIdle = parseMinIdle(env.CI_FAST_MIN_IDLE);
  // Out of scope, or no usable threshold: no reason to ask GitHub.
  const allowed = inScope(scope, labels);
  if (!allowed.ok) return { fast: false, why: allowed.why };
  if (minIdle === null) return decide({ scope, labels, minIdle, idle: 0 });
  const target = parseTarget(env.CI_RUNNER_FAST);
  if (target === null)
    return { fast: false, why: "CI_RUNNER_FAST names no runner group and labels" };
  if (!env.RUNNERS_TOKEN) return { fast: false, why: "no token to read the fast pool's runners" };
  if (!/^[A-Za-z0-9-]+$/.test(env.ORG ?? "")) return { fast: false, why: "no organisation to ask" };
  let idle;
  try {
    const runners = await listGroupRunners({
      fetchImpl,
      token: env.RUNNERS_TOKEN,
      org: env.ORG,
      group: target.group,
    });
    idle = countIdle(runners, target.labels);
  } catch (error) {
    return { fast: false, why: `the fast pool's runners couldn't be read: ${error.message}` };
  }
  return decide({ scope, labels, minIdle, idle });
}

/** The job's step: decides, writes `fast=true|false` to GITHUB_OUTPUT, and never fails. */
export async function main({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  let result;
  try {
    result = await pick({ env, fetchImpl });
  } catch (error) {
    result = { fast: false, why: `the picker failed: ${error.message}` };
  }
  const where = result.fast ? "our fast pool" : "GitHub's runners";
  console.log(`::notice title=Runners for this run::${where}: ${result.why}.`);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `fast=${result.fast}\n`);
  return result;
}

// No top-level await: the hook tests import this file next to others, and main never rejects.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
