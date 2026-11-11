// Reads month-to-date usage from the GraphQL Analytics API and prices it.
// One small query per product, so a broken dataset names itself in the error.
// Any product that cannot be read makes the whole run "no usage data": the
// guard never reports all clear on partial information.
//
// Products on the coverage list (README) that are not live yet carry
// `live: false` and are skipped until they ship.

import { price } from "./pricing.mjs";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

/** Which scripts and buckets belong to which sub-budgeted service. */
export const SERVICES = {
  "turbo-cache": { scripts: ["halonic-turbo-cache"], buckets: ["halonic-turbo-cache"] },
  render: { scripts: ["halonic-render"], buckets: [], containers: true },
};

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
  for (const [name, cfg] of Object.entries(SERVICES)) {
    const parts = [];
    if (cfg.scripts.length) parts.push(await READERS.workers(env, w, { scripts: cfg.scripts }));
    if (cfg.buckets.length) parts.push(await READERS.r2(env, w, { buckets: cfg.buckets }));
    // Containers and Durable Objects are only used by render, so the account-wide reads are its own.
    if (cfg.containers) {
      parts.push(await READERS.containers(env, w), await READERS.durableObjects(env, w));
    }
    services[name] = price(merge(parts), { allowances: false, daysElapsed: w.daysElapsed }).total;
  }
  return { totalUsd: account.total, services, breakdown: account.lines };
}
