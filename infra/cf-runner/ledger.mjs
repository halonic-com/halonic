// The trial's budget and parallel limit (HAL-13578): one Durable Object for the account, which
// every job and snapshot build asks before it starts a container. See README.md.

// standard-4 (4 vCPU, 12 GiB, 20 GB disk) at full use, rounded up: $0.40 an hour.
export const USD_PER_SECOND = 0.4 / 3600;
export const JOB_LIMIT_MS = 60 * 60_000; // the longest Linux job in ci.yml has a 35-minute timeout

export const ledger = (env) => env.LEDGER.get(env.LEDGER.idFromName("ledger"));

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
    if (path === "/release") return this.#release(request, { seconds, running, jobs });
    if (path === "/snapshot") return this.#snapshot(request);
    return Response.json({
      jobs,
      running,
      containerHours: +(seconds / 3600).toFixed(2),
      usd: +(seconds * USD_PER_SECOND).toFixed(2),
      capUsd: this.capUsd,
      maxRunners: this.maxRunners,
      builds: (await s.get("builds")) ?? 0,
      snapshot: summary(await s.get("snapshot")),
    });
  }

  // A container ended after `used` seconds (the body); a snapshot build doesn't count as a job.
  async #release(request, { seconds, running, jobs }) {
    const s = this.state.storage;
    const used = Number(await request.text()) || 0;
    const build = request.headers.get("x-kind") === "build";
    await s.put({
      running: Math.max(0, running - 1),
      seconds: seconds + used,
      jobs: jobs + (used > 0 && !build ? 1 : 0),
      builds: ((await s.get("builds")) ?? 0) + (build ? 1 : 0),
    });
    return new Response(null, { status: 204 });
  }

  // Image B's current snapshot: PUT by the builder, read for each job.
  async #snapshot(request) {
    if (request.method === "PUT") {
      await this.state.storage.put("snapshot", await request.json());
      return new Response(null, { status: 204 });
    }
    return Response.json((await this.state.storage.get("snapshot")) ?? null);
  }
}

const summary = (snap) =>
  snap
    ? {
        mib: Math.round(snap.size / 2 ** 20),
        builtAt: new Date(snap.builtAt).toISOString(),
        buildSeconds: snap.buildSeconds,
      }
    : null;
