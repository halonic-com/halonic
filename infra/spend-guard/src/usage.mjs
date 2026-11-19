// Reads month-to-date usage from the GraphQL Analytics API and prices it.
// One small query per product, so a broken dataset names itself in the error.
// Any product that cannot be read makes the whole run "no usage data": the
// guard never reports all clear on partial information.
//
// Products on the coverage list (README) that are not live yet carry
// `live: false` and are skipped until they ship.

import { price } from "./pricing.mjs";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/**
 * Which scripts and buckets belong to which sub-budgeted service. A service with `containers`
 * also pays for Containers and Durable Objects: those of its own scripts (see `splitByService`),
 * or, with `containers: "rest"`, every one no other service claims.
 */
export const SERVICES = {
  "turbo-cache": { scripts: ["halonic-turbo-cache"], buckets: ["halonic-turbo-cache"] },
  render: { scripts: ["halonic-render"], buckets: [], containers: "rest" },
  // The merge-queue runner trial (HAL-13578); -test is its throwaway test Worker.
  "cf-runner": {
    scripts: ["halonic-cf-runner", "halonic-cf-runner-test"],
    buckets: [],
    containers: { apps: ["a037415f-356a-40d8-b7ed-aa19a408b6e4"] }, // image A (RunnerJob)
  },
};

/**
 * Splits per-application Containers usage and per-namespace Durable Objects usage between the
 * services. Analytics name a Durable Object namespace's script, but not a container
 * application's, so a service claims: the namespaces of its scripts, the applications listed
 * in `containers.apps`, and the applications whose ID is one of its namespaces (a
 * `durable_object` scheduling policy application has its namespace's ID, as seen 19 Nov 2026).
 * Whatever no service claims goes to the `"rest"` service, so new usage is never left out.
 */
export function splitByService(services, { apps, namespaces }) {
  const names = Object.keys(services);
  const out = Object.fromEntries(names.map((s) => [s, []]));
  const rest = names.find((s) => services[s].containers === "rest");
  const own = names.filter((s) => services[s].containers && services[s].containers !== "rest");
  const nsOwner = {};
  for (const [id, { script, usage }] of Object.entries(namespaces)) {
    nsOwner[id] = own.find((s) => services[s].scripts.includes(script)) ?? rest;
    if (nsOwner[id]) out[nsOwner[id]].push(usage);
  }
  for (const [id, usage] of Object.entries(apps)) {
    const s = own.find((s) => services[s].containers.apps?.includes(id)) ?? nsOwner[id] ?? rest;
    if (s) out[s].push(usage);
  }
  return out;
}

export function monthWindow(now) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayMs = 86400e3;
  return {
    since: start.toISOString(),
    until: now.toISOString(),
    daysElapsed: Math.max(1, Math.ceil((now - start) / dayMs)),
    monthFraction:
      (now - start) / (new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) - start),
  };
}

async function gql(env, query, variables) {
  if (!env.CLOUDFLARE_SPEND_GUARD_TOKEN) throw new Error("CLOUDFLARE_SPEND_GUARD_TOKEN is not set");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.CLOUDFLARE_SPEND_GUARD_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GraphQL: ${body.errors[0].message}`.slice(0, 200));
  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("GraphQL: account not visible to this token");
  return account;
}

const sum = (rows, pick) => (rows ?? []).reduce((a, r) => a + (Number(pick(r)) || 0), 0);
const GB = 1e9;

// Each reader returns a usage record for the filter it is given.
export const READERS = {
  async workers(env, w, { scripts } = {}) {
    const filter = scripts
      ? "datetime_geq:$since, datetime_leq:$until, scriptName_in:$scripts"
      : "datetime_geq:$since, datetime_leq:$until";
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!${scripts ? ",$scripts:[string!]" : ""}){viewer{accounts(filter:{accountTag:$tag}){
        workersInvocationsAdaptive(limit:10000, filter:{${filter}}){sum{requests cpuTimeUs}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until, scripts },
    );
    return {
      workersRequests: sum(a.workersInvocationsAdaptive, (r) => r.sum.requests),
      workersCpuMs: sum(a.workersInvocationsAdaptive, (r) => r.sum.cpuTimeUs) / 1000,
    };
  },

  async r2(env, w, { buckets } = {}) {
    const bf = buckets?.length ? ", bucketName_in:$buckets" : "";
    const vars = {
      tag: env.ACCOUNT_ID,
      since: w.since,
      until: w.until,
      ...(buckets?.length ? { buckets } : {}),
    };
    const decl = buckets?.length ? ",$buckets:[string!]" : "";
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!${decl}){viewer{accounts(filter:{accountTag:$tag}){
        ops:r2OperationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until${bf}}){sum{requests} dimensions{actionType}}
        storage:r2StorageAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until${bf}}){max{payloadSize metadataSize} dimensions{bucketName}}}}}`,
      vars,
    );
    // Class A: writes, lists, multipart. Class B: reads and heads. Deletes are free.
    const classA = new Set([
      "ListBuckets",
      "PutBucket",
      "ListObjects",
      "PutObject",
      "CopyObject",
      "CompleteMultipartUpload",
      "CreateMultipartUpload",
      "ListMultipartUploads",
      "UploadPart",
      "UploadPartCopy",
      "ListParts",
      "PutBucketEncryption",
      "PutBucketCors",
      "PutBucketLifecycleConfiguration",
    ]);
    const classB = new Set([
      "HeadBucket",
      "HeadObject",
      "GetObject",
      "UsageSummary",
      "GetBucketEncryption",
      "GetBucketLocation",
      "GetBucketCors",
      "GetBucketLifecycleConfiguration",
    ]);
    let ca = 0;
    let cb = 0;
    for (const row of a.ops ?? []) {
      const t = row.dimensions.actionType;
      if (classA.has(t)) ca += row.sum.requests;
      else if (classB.has(t)) cb += row.sum.requests;
      else if (!/^Delete|^Abort/.test(t)) ca += row.sum.requests; // unknown type: price it as the dearer class
    }
    // Upper bound: each bucket's largest size this month, held for the elapsed part of the month.
    const peak = (a.storage ?? []).reduce(
      (t, r) => t + (r.max.payloadSize + r.max.metadataSize) / GB,
      0,
    );
    return { r2ClassA: ca, r2ClassB: cb, r2StorageGbMonth: peak * w.monthFraction };
  },

  async kv(env, w) {
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$tag}){
        ops:kvOperationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{requests} dimensions{actionType}}
        storage:kvStorageAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){max{byteCount}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until },
    );
    let reads = 0;
    let writes = 0;
    for (const row of a.ops ?? []) {
      if (row.dimensions.actionType === "read") reads += row.sum.requests;
      else writes += row.sum.requests; // write, delete, list
    }
    const peak = Math.max(0, ...(a.storage ?? []).map((r) => r.max.byteCount / GB));
    return { kvReads: reads, kvWrites: writes, kvStorageGbMonth: peak * w.monthFraction };
  },

  async durableObjects(env, w) {
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$tag}){
        inv:durableObjectsInvocationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{requests}}
        dur:durableObjectsPeriodicGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{activeTime}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until },
    );
    // activeTime is in microseconds; billing counts GB-seconds at 128 MB per object.
    return {
      doRequests: sum(a.inv, (r) => r.sum.requests),
      doGbSeconds: (sum(a.dur, (r) => r.sum.activeTime) / 1e6) * 0.125,
    };
  },

  // Units checked against real HAL-3083 data (11 Nov 2026, standard-4 = 12 GiB, 20 GB disk):
  // cpuTimeSec is vCPU-seconds; allocatedMemory is bytes x seconds (12 GiB x 10 s = 128849018880);
  // allocatedDisk is bytes x seconds (20 GB x 10 s = 2e11). Billing uses GiB-s and GB-s.
  async containers(env, w) {
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$tag}){
        c:containersUsageAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{cpuTimeSec allocatedMemory allocatedDisk}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until },
    );
    return {
      containerVcpuSeconds: sum(a.c, (r) => r.sum.cpuTimeSec),
      containerMemGibSeconds: sum(a.c, (r) => r.sum.allocatedMemory) / 2 ** 30,
      containerDiskGbSeconds: sum(a.c, (r) => r.sum.allocatedDisk) / GB,
    };
  },

  // The two readers above, per container application and per Durable Object namespace (with its
  // script), for splitByService. Same units.
  async containerParts(env, w) {
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$tag}){
        c:containersUsageAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{cpuTimeSec allocatedMemory allocatedDisk} dimensions{applicationId}}
        inv:durableObjectsInvocationsAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{requests} dimensions{namespaceId scriptName}}
        dur:durableObjectsPeriodicGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{activeTime} dimensions{namespaceId}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until },
    );
    const apps = {};
    for (const r of a.c ?? []) {
      const u = (apps[r.dimensions.applicationId] ??= {
        containerVcpuSeconds: 0,
        containerMemGibSeconds: 0,
        containerDiskGbSeconds: 0,
      });
      u.containerVcpuSeconds += Number(r.sum.cpuTimeSec) || 0;
      u.containerMemGibSeconds += (Number(r.sum.allocatedMemory) || 0) / 2 ** 30;
      u.containerDiskGbSeconds += (Number(r.sum.allocatedDisk) || 0) / GB;
    }
    const namespaces = {};
    const ns = (id) =>
      (namespaces[id] ??= { script: null, usage: { doRequests: 0, doGbSeconds: 0 } });
    for (const r of a.inv ?? []) {
      const n = ns(r.dimensions.namespaceId);
      n.script ??= r.dimensions.scriptName;
      n.usage.doRequests += Number(r.sum.requests) || 0;
    }
    for (const r of a.dur ?? []) {
      ns(r.dimensions.namespaceId).usage.doGbSeconds +=
        ((Number(r.sum.activeTime) || 0) / 1e6) * 0.125;
    }
    return { apps, namespaces };
  },

  async workersAi(env, w) {
    const a = await gql(
      env,
      `query($tag:String!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$tag}){
        ai:aiInferenceAdaptiveGroups(limit:10000, filter:{datetime_geq:$since, datetime_leq:$until}){sum{totalNeurons}}}}}`,
      { tag: env.ACCOUNT_ID, since: w.since, until: w.until },
    );
    return { aiNeurons: sum(a.ai, (r) => r.sum.totalNeurons) };
  },
};

export const COVERAGE = [
  { product: "workers", live: true },
  { product: "r2", live: true },
  { product: "kv", live: true },
  { product: "workersAi", live: true },
  { product: "durableObjects", live: true },
  { product: "containers", live: true },
];

const merge = (parts) => {
  const out = {};
  for (const p of parts) for (const [k, v] of Object.entries(p)) out[k] = (out[k] ?? 0) + v;
  return out;
};

export async function readUsage(env, now) {
  const w = monthWindow(now);
  const live = COVERAGE.filter((c) => c.live);
  const results = await Promise.all(
    live.map(async (c) => {
      try {
        return [c.product, await READERS[c.product](env, w)];
      } catch (e) {
        throw new Error(`${c.product}: ${e.message}`);
      }
    }),
  );
  const usage = merge(results.map(([, u]) => u));
  const account = price(usage, { allowances: true, daysElapsed: w.daysElapsed });

  // Per-service estimate, without free allowances (so it errs high).
  const services = {};
  const containerShares = splitByService(SERVICES, await READERS.containerParts(env, w));
  for (const [name, cfg] of Object.entries(SERVICES)) {
    const parts = [...containerShares[name]];
    if (cfg.scripts.length) parts.push(await READERS.workers(env, w, { scripts: cfg.scripts }));
    if (cfg.buckets.length) parts.push(await READERS.r2(env, w, { buckets: cfg.buckets }));
    services[name] = price(merge(parts), { allowances: false, daysElapsed: w.daysElapsed }).total;
  }
  return { totalUsd: account.total, services, breakdown: account.lines };
}
