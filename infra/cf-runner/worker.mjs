// One-job GitHub Actions runners on Cloudflare Containers (trial, HAL-13578). See README.md.
//
// GitHub sends a `workflow_job` webhook when a job asking for the `cf-linux` label is queued.
// This Worker checks it is the merge queue or a push to main of halonic-com/halonic, asks
// GitHub for a one-time runner registration (JIT config) and starts one container that runs
// exactly that runner. The runner takes one job, deregisters itself, and the container stops.

import { checkSpend } from "../spend-guard/src/check-spend.mjs";
import bootstrap from "./bootstrap.sh";
import {
  b64url,
  LABEL,
  nextStep,
  ORG,
  pemToPkcs8,
  REPO,
  RUNNER_GROUP,
  stillQueued,
  trustedRun,
  validSignature,
  wantedJob,
} from "./lib.mjs";

// standard-4 (4 vCPU, 12 GiB, 20 GB disk) at full use, rounded up: $0.40 an hour.
export const USD_PER_SECOND = 0.4 / 3600;
const START_GIVE_UP_MS = 45 * 60_000; // a job nobody could start for this long stays queued on GitHub
const JOB_LIMIT_MS = 60 * 60_000; // the longest Linux job in ci.yml has a 35-minute timeout
const RETRY_MS = 20_000;
const POLL_MS = 60_000;
// Cloudflare stops a container soon after its Durable Object goes idle, even mid-job, unless
// given this. The alarms above run well within it.
const INACTIVITY_MS = 10 * 60_000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/status") {
      return ledger(env).fetch("https://ledger/status");
    }
    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return new Response("not found", { status: 404 });
    }
    const body = await request.text();
    if (
      !(await validSignature(
        env.GH_WEBHOOK_SECRET,
        body,
        request.headers.get("x-hub-signature-256"),
      ))
    ) {
      return new Response("bad signature", { status: 401 });
    }
    const event = request.headers.get("x-github-event");
    if (event === "ping") return new Response("pong");
    if (event !== "workflow_job") return new Response(null, { status: 204 });
    const payload = JSON.parse(body);
    const job = wantedJob(payload);
    if (!job) return new Response(null, { status: 204 });
    if (!(await checkSpend(env, "cf-runner"))) {
      console.log(JSON.stringify({ msg: "spend switch off, job left queued", job: job.id }));
      return new Response("spend switch off", { status: 503 });
    }
    const token = await installationToken(env, payload.installation?.id);
    const run = await github(token, "GET", `/repos/${REPO}/actions/runs/${job.runId}`);
    if (!trustedRun(run)) {
      console.log(
        JSON.stringify({ msg: "refused", job: job.id, event: run.event, branch: run.head_branch }),
      );
      return new Response("not a merge-queue or main run", { status: 403 });
    }
    const stub = env.RUNNER_JOB.get(env.RUNNER_JOB.idFromName(`job-${job.id}`));
    return stub.fetch("https://job/start", {
      method: "POST",
      body: JSON.stringify({ ...job, installationId: payload.installation.id }),
    });
  },
};

// ---- GitHub App ----

async function appJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: env.GH_APP_ID })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(env.GH_APP_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `${head}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head)))}`;
}

// An hour-long token for this repository only, with only the two permissions the Worker uses.
async function installationToken(env, installationId) {
  if (!env.GH_APP_ID || !env.GH_APP_PRIVATE_KEY || !installationId)
    throw new Error("GitHub App not configured");
  const res = await github(
    `Bearer ${await appJwt(env)}`,
    "POST",
    `/app/installations/${installationId}/access_tokens`,
    {
      repositories: [REPO.split("/")[1]],
      // Registering an org runner needs only "Self-hosted runners", not repository Administration.
      permissions: { organization_self_hosted_runners: "write", actions: "read" },
    },
  );
  return `token ${res.token}`;
}

// The org's runner group RUNNER_GROUP, which the board set up with access to halonic-com/halonic
// only. An org on GitHub Free has only the Default group; the job-started hook still refuses
// any other repository there.
let groupId;
async function runnerGroup(token) {
  if (groupId) return groupId;
  const { runner_groups } = await github(
    token,
    "GET",
    `/orgs/${ORG}/actions/runner-groups?per_page=100`,
  );
  const group =
    runner_groups.find((g) => g.name === RUNNER_GROUP) ?? runner_groups.find((g) => g.default);
  if (!group) throw new Error(`no runner group ${RUNNER_GROUP} in ${ORG}`);
  groupId = group.id;
  return groupId;
}

async function github(auth, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: auth,
      accept: "application/vnd.github+json",
      "user-agent": "halonic-cf-runner",
      "x-github-api-version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 && method !== "POST") return null;
  if (!res.ok)
    throw new Error(`GitHub ${method} ${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? {} : res.json();
}

// ---- One job: one Durable Object, one container ----

export class RunnerJob {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // A restarted Durable Object (a deploy, or between two alarms) starts without the timeout.
    const container = state.container;
    if (container?.running) {
      state.blockConcurrencyWhile(() => container.setInactivityTimeout(INACTIVITY_MS));
    }
  }

  async fetch(request) {
    if (await this.state.storage.get("job"))
      return new Response("already started", { status: 200 });
    const job = await request.json();
    await this.state.storage.put({
      job,
      phase: "pending",
      giveUpAt: Date.now() + START_GIVE_UP_MS,
    });
    await this.state.storage.setAlarm(Date.now());
    return new Response("starting", { status: 202 });
  }

  async alarm() {
    const s = this.state.storage;
    const [job, phase] = [await s.get("job"), await s.get("phase")];
    if (phase === "pending") return this.#tryStart(job);
    if (phase !== "running") return;
    const startedAt = await s.get("startedAt");
    if (this.state.container?.running && Date.now() - startedAt < JOB_LIMIT_MS) {
      const step = await this.#check(job);
      if (step === "keep") return s.setAlarm(Date.now() + POLL_MS);
      this.#log(job, step === "relaunch" ? "runner taken by another job" : "job gone, runner idle");
    }
    if (this.state.container?.running) await this.state.container.destroy();
    await this.#finish(job, startedAt);
  }

  async #tryStart(job) {
    const s = this.state.storage;
    try {
      const launched = await this.#launch(job);
      if (launched === "started") return s.setAlarm(Date.now() + POLL_MS);
      if (launched === "gone") {
        await s.put("phase", "done");
        return this.#log(job, "job no longer queued, nothing started");
      }
    } catch (error) {
      console.log(
        JSON.stringify({ msg: "start failed", job: job.id, error: String(error).slice(0, 300) }),
      );
      await this.#dropRunner(job);
    }
    if (Date.now() > (await s.get("giveUpAt"))) return this.#log(job, "gave up starting");
    return s.setAlarm(Date.now() + RETRY_MS);
  }

  // "relaunch", "stop" or "keep" for a running container (see nextStep). Keeps it when GitHub
  // doesn't answer, so a short outage doesn't stop a job.
  async #check(job) {
    try {
      const token = await installationToken(this.env, job.installationId);
      const runnerId = await this.state.storage.get("runnerId");
      const [ours, runner] = await Promise.all([
        github(token, "GET", `/repos/${REPO}/actions/jobs/${job.id}`),
        github(token, "GET", `/orgs/${ORG}/actions/runners/${runnerId}`),
      ]);
      return nextStep(ours, runner, runnerId);
    } catch (error) {
      this.#log(job, "check failed", { error: String(error).slice(0, 300) });
      return "keep";
    }
  }

  // Starts the container: "started", "wait" when the trial is at its limit, or "gone" when
  // GitHub no longer has the job queued (cancelled, or another runner took it).
  async #launch(job) {
    const token = await installationToken(this.env, job.installationId);
    if (!stillQueued(await github(token, "GET", `/repos/${REPO}/actions/jobs/${job.id}`))) {
      return "gone";
    }
    const room = await (
      await ledger(this.env).fetch("https://ledger/reserve", { method: "POST" })
    ).json();
    if (!room.ok) {
      console.log(JSON.stringify({ msg: "waiting", job: job.id, reason: room.reason }));
      return "wait";
    }
    try {
      const jit = await github(token, "POST", `/orgs/${ORG}/actions/runners/generate-jitconfig`, {
        name: `cf-${job.id}`,
        runner_group_id: await runnerGroup(token),
        labels: [LABEL],
        work_folder: "_work",
      });
      await this.state.storage.put({
        runnerId: jit.runner.id,
        phase: "running",
        startedAt: Date.now(),
        released: false,
      });
      this.state.container.start({
        entrypoint: ["bash", "-c", `${bootstrap}\n${RUN}`],
        env: { ACTIONS_RUNNER_INPUT_JITCONFIG: jit.encoded_jit_config },
        enableInternet: true,
      });
      await this.state.container.setInactivityTimeout(INACTIVITY_MS);
      console.log(
        JSON.stringify({ msg: "started", job: job.id, name: job.name, runner: jit.runner.id }),
      );
      return "started";
    } catch (error) {
      await ledger(this.env).fetch("https://ledger/release", { method: "POST", body: "0" });
      await this.state.storage.put("phase", "pending");
      throw error;
    }
  }

  async #finish(job, startedAt) {
    const s = this.state.storage;
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    // Once per container, even when this alarm fails below and runs again.
    if (!(await s.get("released"))) {
      await ledger(this.env).fetch("https://ledger/release", {
        method: "POST",
        body: String(seconds),
      });
      await s.put("released", true);
    }
    // If our job is still queued, the container never ran it: it stopped before taking a job
    // (no capacity, bootstrap failed), or another job took our runner. Start another.
    const token = await installationToken(this.env, job.installationId);
    const queued = stillQueued(await github(token, "GET", `/repos/${REPO}/actions/jobs/${job.id}`));
    await this.#dropRunner(job);
    if (queued && Date.now() < (await s.get("giveUpAt"))) {
      this.#log(job, "container ended without our job; retrying", { seconds });
      await s.put({ phase: "pending", released: false });
      return s.setAlarm(Date.now() + RETRY_MS);
    }
    await s.put("phase", "done");
    this.#log(job, queued ? "gave up starting" : "finished", {
      seconds,
      usd: +(seconds * USD_PER_SECOND).toFixed(3),
    });
  }

  // An ephemeral runner removes itself after its job; one that never took a job is removed here.
  async #dropRunner(job) {
    const runnerId = await this.state.storage.get("runnerId");
    if (!runnerId) return;
    try {
      const token = await installationToken(this.env, job.installationId);
      await fetch(`https://api.github.com/orgs/${ORG}/actions/runners/${runnerId}`, {
        method: "DELETE",
        headers: { authorization: token, "user-agent": "halonic-cf-runner" },
      });
    } catch {}
    await this.state.storage.delete("runnerId");
  }

  #log(job, msg, extra = {}) {
    console.log(JSON.stringify({ msg, job: job.id, name: job.name, run: job.runId, ...extra }));
  }
}

// After bootstrap.sh, in the same shell (so $home and $dir are set): sample memory and disk,
// run the runner once as `runner`, print the measurements.
const RUN = `
/usr/local/bin/cf-sample &
runuser -u runner -- env HOME="$home" \\
  ACTIONS_RUNNER_INPUT_JITCONFIG="$ACTIONS_RUNNER_INPUT_JITCONFIG" \\
  ACTIONS_RUNNER_HOOK_JOB_STARTED="$home/job-started.sh" \\
  ACTIONS_RUNNER_HOOK_JOB_COMPLETED="$home/job-completed.sh" \\
  "$dir/run.sh" || true
cat /opt/cf-runner/job-metrics 2>/dev/null || true
`;

// ---- The trial's budget and parallel limit: one Durable Object for the account ----

const ledger = (env) => env.LEDGER.get(env.LEDGER.idFromName("ledger"));

export class Ledger {
  constructor(state, env) {
    this.state = state;
    this.capUsd = Number(env.CAP_USD ?? 18);
    this.maxRunners = Number(env.MAX_RUNNERS ?? 4);
  }

  async fetch(request) {
    const s = this.state.storage;
    const seconds = (await s.get("seconds")) ?? 0;
    const running = (await s.get("running")) ?? 0;
    const jobs = (await s.get("jobs")) ?? 0;
    const path = new URL(request.url).pathname;
    if (path === "/reserve") {
      // Each running job could still use up to its time limit.
      const committed = (seconds + (running + 1) * (JOB_LIMIT_MS / 1000)) * USD_PER_SECOND;
      if (committed > this.capUsd) return Response.json({ ok: false, reason: "budget" });
      if (running >= this.maxRunners) return Response.json({ ok: false, reason: "parallel limit" });
      await s.put({ running: running + 1 });
      return Response.json({ ok: true });
    }
    if (path === "/release") {
      const used = Number(await request.text()) || 0;
      await s.put({
        running: Math.max(0, running - 1),
        seconds: seconds + used,
        jobs: jobs + (used > 0 ? 1 : 0),
      });
      return new Response(null, { status: 204 });
    }
    return Response.json({
      jobs,
      running,
      containerHours: +(seconds / 3600).toFixed(2),
      usd: +(seconds * USD_PER_SECOND).toFixed(2),
      capUsd: this.capUsd,
      maxRunners: this.maxRunners,
    });
  }
}
