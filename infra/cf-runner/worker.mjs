// One-job GitHub Actions runners on Cloudflare Containers (trial, HAL-13578). See README.md.
//
// GitHub sends a `workflow_job` webhook when a job asking for the `cf-linux` label is queued.
// This Worker checks it is the merge queue or a push to main of halonic-com/halonic, asks
// GitHub for a one-time runner registration (JIT config) and starts one container that runs
// exactly that runner. The runner takes one job, deregisters itself, and the container stops.
//
// Two images (HAL-13578, board 19 Nov): A starts plain ubuntu:24.04 and sets it up per job
// (bootstrap.sh). B starts from a snapshot of a container that already ran bootstrap.sh and
// prefill.sh (a warm pnpm store from main's lockfile); a cron rebuilds it nightly or when the
// lockfile changes. IMAGE_B picks which jobs get B: "off", "alternate" (by run) or "all".

import { checkSpend } from "../spend-guard/src/check-spend.mjs";
import bootstrap from "./bootstrap.sh";
import {
  b64url,
  imageFor,
  LABEL,
  nextStep,
  ORG,
  pemToPkcs8,
  REPO,
  RUNNER_GROUP,
  snapshotDue,
  stillQueued,
  trustedRun,
  validSignature,
  wantedJob,
} from "./lib.mjs";
import { JOB_LIMIT_MS, ledger, USD_PER_SECOND } from "./ledger.mjs";
import prefill from "./prefill.sh";

export { Ledger } from "./ledger.mjs";

const START_GIVE_UP_MS = 45 * 60_000; // a job nobody could start for this long stays queued on GitHub
const RETRY_MS = 20_000;
const POLL_MS = 60_000;
// Cloudflare stops a container soon after its Durable Object goes idle, even mid-job, unless
// given this. The alarms above run well within it.
const INACTIVITY_MS = 10 * 60_000;
const BUILD_LIMIT_MS = 30 * 60_000; // a snapshot build that isn't ready by then is stopped
const BUILD_POLL_MS = 20_000;
const LOCKFILE_URL = `https://raw.githubusercontent.com/${REPO}/main/pnpm-lock.yaml`;

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
        JSON.stringify({
          msg: "refused",
          job: job.id,
          event: run?.event,
          branch: run?.head_branch,
        }),
      );
      return new Response("not a merge-queue or main run", { status: 403 });
    }
    const snapshot = await (await ledger(env).fetch("https://ledger/snapshot")).json();
    const image = imageFor(env.IMAGE_B, job.runId, snapshot);
    const ns = image === "b" ? env.RUNNER_JOB_B : env.RUNNER_JOB;
    const stub = ns.get(ns.idFromName(`job-${job.id}`));
    return stub.fetch("https://job/start", {
      method: "POST",
      body: JSON.stringify({
        ...job,
        installationId: payload.installation.id,
        image,
        snapshot: image === "b" ? { id: snapshot.id } : undefined,
      }),
    });
  },

  // Image B's snapshot: rebuilt when main's lockfile changed or the last one is a day old.
  async scheduled(_controller, env) {
    if ((env.IMAGE_B ?? "off") === "off") return;
    if (!(await checkSpend(env, "cf-runner"))) return;
    const res = await fetch(LOCKFILE_URL, { headers: { "user-agent": "halonic-cf-runner" } });
    if (!res.ok)
      return console.log(JSON.stringify({ msg: "lockfile fetch failed", status: res.status }));
    const lock = hex(await crypto.subtle.digest("SHA-256", await res.arrayBuffer()));
    const snapshot = await (await ledger(env).fetch("https://ledger/snapshot")).json();
    if (!snapshotDue(snapshot, lock, Date.now())) return;
    // One builder per lockfile and day; a builder that's already at work ignores the request.
    const day = new Date().toISOString().slice(0, 10);
    const stub = env.RUNNER_JOB_B.get(env.RUNNER_JOB_B.idFromName(`build-${lock}-${day}`));
    await stub.fetch("https://job/build", { method: "POST", body: JSON.stringify({ lock }) });
  },
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

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
// only. Never fall back to the Default group: it may be open to other repositories.
let groupId;
async function runnerGroup(token) {
  if (groupId) return groupId;
  const { runner_groups } = await github(
    token,
    "GET",
    `/orgs/${ORG}/actions/runner-groups?per_page=100`,
  );
  const group = runner_groups.find((g) => g.name === RUNNER_GROUP);
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
      this.state.container.start(this.startOptions(job, jit.encoded_jit_config));
      await this.state.container.setInactivityTimeout(INACTIVITY_MS);
      console.log(
        JSON.stringify({
          msg: "started",
          job: job.id,
          name: job.name,
          runner: jit.runner.id,
          image: job.image ?? "a",
        }),
      );
      return "started";
    } catch (error) {
      await ledger(this.env).fetch("https://ledger/release", { method: "POST", body: "0" });
      await this.state.storage.put("phase", "pending");
      throw error;
    }
  }

  // Image A: plain ubuntu:24.04 from the application's config, set up by bootstrap.sh.
  startOptions(_job, jitConfig) {
    return {
      entrypoint: ["bash", "-c", `${bootstrap}\n${RUN}`],
      env: {
        ACTIONS_RUNNER_INPUT_JITCONFIG: jitConfig,
        CF_STARTED_AT: now(),
        CF_RUNNER_IMAGE: "a",
      },
      enableInternet: true,
    };
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
      image: job.image ?? "a",
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

const now = () => String(Math.floor(Date.now() / 1000));

// ---- Image B: jobs start from a snapshot; a builder makes the snapshot ----

export class RunnerJobB extends RunnerJob {
  // The snapshot already ran bootstrap.sh and prefill.sh: only find the runner and run it.
  startOptions(job, jitConfig) {
    return {
      containerSnapshot: job.snapshot,
      instance: "standard-4",
      entrypoint: [
        "bash",
        "-c",
        `home=$(getent passwd runner | cut -d: -f6)\ndir=$home/actions-runner\n${RUN}`,
      ],
      env: {
        ACTIONS_RUNNER_INPUT_JITCONFIG: jitConfig,
        CF_STARTED_AT: now(),
        CF_RUNNER_IMAGE: "b",
      },
      enableInternet: true,
    };
  }

  async fetch(request) {
    if (new URL(request.url).pathname !== "/build") return super.fetch(request);
    const s = this.state.storage;
    if (await s.get("build")) return new Response("already building", { status: 200 });
    const room = await (
      await ledger(this.env).fetch("https://ledger/reserve", { method: "POST" })
    ).json();
    if (!room.ok) return new Response(`no room: ${room.reason}`, { status: 503 });
    const { lock } = await request.json();
    await s.put({ build: { lock, startedAt: Date.now() } });
    // Same image family as the jobs: Cloudflare's managed Debian; bootstrap.sh adds the rest.
    this.state.container.start({
      image: "cloudflare/debian-trixie",
      instance: "standard-4",
      entrypoint: ["bash", "-c", `${bootstrap}\n${prefill}\nexec sleep infinity`],
      enableInternet: true,
    });
    await this.state.container.setInactivityTimeout(INACTIVITY_MS);
    console.log(JSON.stringify({ msg: "snapshot build started", lock }));
    await s.setAlarm(Date.now() + BUILD_POLL_MS);
    return new Response("building", { status: 202 });
  }

  async alarm() {
    const build = await this.state.storage.get("build");
    if (!build) return super.alarm();
    if (build.done) return;
    const elapsed = Date.now() - build.startedAt;
    let result = "failed: container stopped";
    if (this.state.container?.running) {
      const marker = await this.#read("/opt/cf-runner/prefilled");
      if (marker === null && elapsed < BUILD_LIMIT_MS) {
        return this.state.storage.setAlarm(Date.now() + BUILD_POLL_MS);
      }
      result = marker === null ? "failed: not ready in time" : "ready";
      if (marker !== null) {
        const snap = await this.state.container.snapshotContainer({
          name: `cf-runner-b-${build.lock.slice(0, 12)}`,
        });
        const lock = /lockfile=([0-9a-f]{64})/.exec(marker)?.[1] ?? build.lock;
        await ledger(this.env).fetch("https://ledger/snapshot", {
          method: "PUT",
          body: JSON.stringify({
            id: snap.id,
            size: snap.size,
            lock,
            builtAt: Date.now(),
            buildSeconds: Math.round(elapsed / 1000),
          }),
        });
        result = `snapshot ${snap.id}, ${Math.round(snap.size / 2 ** 20)} MiB`;
      }
      await this.state.container.destroy();
    }
    await ledger(this.env).fetch("https://ledger/release", {
      method: "POST",
      body: String(Math.round(elapsed / 1000)),
      headers: { "x-kind": "build" },
    });
    await this.state.storage.put("build", { ...build, done: true });
    console.log(
      JSON.stringify({
        msg: `snapshot build ${result}`,
        lock: build.lock,
        seconds: Math.round(elapsed / 1000),
      }),
    );
  }

  async #read(path) {
    try {
      const proc = await this.state.container.exec(["cat", path]);
      const out = await proc.output();
      return out.exitCode === 0 ? new TextDecoder().decode(out.stdout) : null;
    } catch {
      return null;
    }
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
