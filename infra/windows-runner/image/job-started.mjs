// The Windows runner VM's job-started hook, run by the Actions runner before a job's first step
// (ACTIONS_RUNNER_HOOK_JOB_STARTED, through job-started.ps1); a non-zero exit fails the job. It's
// in the base image, so a job can't change it before it runs. The VM runs a job as an
// administrator with WSL, so only reviewed code may run here: a push, a schedule or a manual run
// on main of halonic-com/halonic, never a pull request, a merge group or a fork (HAL-18572).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const REPO = "halonic-com/halonic";
export const MAIN = "refs/heads/main";
export const EVENT_FILE = "C:\\actions-runner\\_work\\_temp\\_github_workflow\\event.json"; // leak-guard: allow absolute-path the runner's event file inside the VM
const ALLOWED = new Set(["push", "schedule", "workflow_dispatch"]);
const WORKFLOW_REF =
  /^halonic-com\/halonic\/\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml@refs\/heads\/main$/;

/**
 * Which event the runner's event file holds, from its shape. The event name in the environment
 * must match it, so a pull request's payload can't pass as a push.
 */
export function eventKind(event) {
  if (event === null || typeof event !== "object" || Array.isArray(event)) return "unreadable";
  if ("merge_group" in event) return "merge_group";
  if ("pull_request" in event) return "pull_request";
  if (typeof event.schedule === "string") return "schedule";
  if ("pusher" in event && "ref" in event) return "push";
  if ("workflow" in event && "ref" in event) return "workflow_dispatch";
  return "unknown";
}

// The event's own repository, which must be ours and not a fork. A schedule's payload may carry
// none; the environment's (checked first) still holds then.
function eventRepositoryRefusal(kind, event) {
  if (kind === "schedule" && event.repository === undefined) return null;
  const from = event.repository?.full_name ?? "unset";
  if (from !== REPO) return `repository ${from} in the event`;
  if (event.repository.fork !== false) return "fork repository";
  return null;
}

// The branch and the workflow file: main only, in the environment and in the event.
function refRefusal(kind, env, event) {
  const ref = env.GITHUB_REF ?? "unset";
  if (ref !== MAIN) return `ref ${ref}`;
  if (kind !== "schedule" && event.ref !== MAIN) return `ref ${event.ref} in the event`;
  const workflow = env.GITHUB_WORKFLOW_REF ?? "unset";
  if (!WORKFLOW_REF.test(workflow)) return `workflow ${workflow}`;
  return null;
}

/** Says why the job may not run on this VM, or null when it may. */
export function refusal(env, event) {
  const repo = env.GITHUB_REPOSITORY ?? "unset";
  if (repo !== REPO) return `repository ${repo}`;
  const name = env.GITHUB_EVENT_NAME ?? "unset";
  if (!ALLOWED.has(name)) return `event ${name}`;
  const kind = eventKind(event);
  if (kind !== name) return `event name ${name} does not match the event (${kind})`;
  return eventRepositoryRefusal(kind, event) ?? refRefusal(kind, env, event);
}

function deny(why) {
  console.log(
    `::error title=halonic-win refused this job::${why}. This runner only takes reviewed code: a push, a schedule or a manual run on main of ${REPO}, from a workflow on main.`,
  );
  process.exit(1);
}

function main() {
  const path = process.env.GITHUB_EVENT_PATH ?? "";
  if (path.toLowerCase() !== EVENT_FILE.toLowerCase()) deny(`unexpected event path ${path}`);
  let event;
  try {
    event = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    deny(`event file unreadable (${error.message})`);
  }
  const why = refusal(process.env, event);
  if (why !== null) deny(why);
  console.log(
    `halonic-win: accepted ${process.env.GITHUB_EVENT_NAME} for ${process.env.GITHUB_WORKFLOW_REF}`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
