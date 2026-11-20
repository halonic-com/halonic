// The parts of the runner Worker that need no Cloudflare runtime, so `node --test` can check them.

export const REPO = "halonic-com/halonic";
export const ORG = "halonic-com";
export const LABEL = "cf-linux";
export const RUNNER_GROUP = "cf-runner";

// The queued `cf-linux` job of halonic-com/halonic in a webhook payload, else null.
export function wantedJob(payload) {
  const job = payload?.workflow_job;
  if (payload?.action !== "queued" || !job) return null;
  if (payload.repository?.full_name !== REPO) return null;
  if (!Array.isArray(job.labels) || !job.labels.includes(LABEL)) return null;
  return { id: job.id, runId: job.run_id, name: job.name, queuedAt: job.created_at };
}

// Only the merge queue of main and pushes to main, from the repository itself. The run's event
// comes from GitHub's API, not from the workflow file, so a pull request can't claim it.
export function trustedRun(run) {
  if (run?.repository?.full_name !== REPO || run?.head_repository?.full_name !== REPO) return false;
  // Only ci.yml asks for cf-linux, and it runs on branch pushes only. Another workflow run by a
  // push of a tag named `main` would also show head_branch `main`.
  if (run.path !== ".github/workflows/ci.yml") return false;
  if (run.event === "merge_group")
    return String(run.head_branch).startsWith("gh-readonly-queue/main/");
  if (run.event === "push") return run.head_branch === "main";
  return false;
}

// A job GitHub hasn't given to any runner yet. Null (the run was deleted) is not.
export const stillQueued = (job) =>
  ["queued", "waiting", "requested", "pending"].includes(job?.status);

// What to do with a running container, from GitHub's view of our job and of our runner (null
// once it's gone). Any `cf-linux` job may take our runner, a pull request's too (the job-started
// hook then fails it), so our job can still be queued after our runner is used up.
export function nextStep(job, runner, runnerId) {
  if (!runner) return stillQueued(job) ? "relaunch" : "keep";
  // Ours is done or cancelled, or ran elsewhere, and our runner sits idle: stop paying for it.
  if (!stillQueued(job) && !runner.busy && job?.runner_id !== runnerId) return "stop";
  return "keep";
}

export async function validSignature(secret, body, header) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const given = hexBytes(header.slice(7));
  if (!given || given.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac[i] ^ given[i];
  return diff === 0;
}

const hexBytes = (hex) =>
  /^[0-9a-f]{64}$/.test(hex)
    ? Uint8Array.from(hex.match(/../g), (h) => Number.parseInt(h, 16))
    : null;

export const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// GitHub hands out PKCS#1 keys ("BEGIN RSA PRIVATE KEY"); WebCrypto reads only PKCS#8.
export function pemToPkcs8(pem) {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  if (pem.includes("BEGIN PRIVATE KEY")) return der;
  // DER lengths; an RSA key's are under 64 KiB.
  const len = (n) => {
    if (n < 128) return [n];
    if (n < 256) return [0x81, n];
    return [0x82, n >> 8, n & 255];
  };
  const rsaAlgorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  const octets = [0x04, ...len(der.length)];
  const inner = [0x02, 0x01, 0x00, ...rsaAlgorithm, ...octets];
  return Uint8Array.from([0x30, ...len(inner.length + der.length), ...inner, ...der]);
}

// Image B's snapshot is rebuilt after a day even when main's lockfile didn't change, so the
// toolchain and runner stay current ("nightly"), and well before Cloudflare's 30-day expiry.
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;

// "a" or "b" for a job, from the IMAGE_B setting ("off", "alternate", "all"). Alternating by run
// keeps both jobs of one merge-queue run on the same image, so runs compare whole. Without a
// snapshot every job gets A.
export function imageFor(mode, runId, snapshot) {
  if (!snapshot?.id) return "a";
  if (mode === "all") return "b";
  if (mode === "alternate") return Number(runId) % 2 === 1 ? "b" : "a";
  return "a";
}

// Whether to build a new snapshot for main's lockfile (its SHA-256, hex) at time `now`.
export function snapshotDue(snapshot, lock, now) {
  if (!snapshot?.id) return true;
  if (snapshot.lock !== lock) return true;
  return now - snapshot.builtAt > SNAPSHOT_MAX_AGE_MS;
}
