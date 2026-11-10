// Cloudflare's published rates (see README for sources and the date checked).
// Quantities are what the usage readers return; prices are US dollars.

export const RATES = {
  workersPaidPlanUsd: 5,
  workers: {
    includedRequests: 10e6,
    perMillionRequests: 0.3,
    includedCpuMs: 30e6,
    perMillionCpuMs: 0.02,
  },
  r2: {
    freeGb: 10,
    perGbMonth: 0.015,
    freeClassA: 1e6,
    perMillionClassA: 4.5,
    freeClassB: 10e6,
    perMillionClassB: 0.36,
  },
  kv: {
    freeReads: 10e6,
    perMillionReads: 0.5,
    freeWrites: 1e6,
    perMillionWrites: 5,
    freeGb: 1,
    perGbMonth: 0.5,
  },
  durableObjects: {
    includedRequests: 1e6,
    perMillionRequests: 0.15,
    includedGbSeconds: 400e3,
    perMillionGbSeconds: 12.5,
  },
  workersAi: { freeNeuronsPerDay: 10e3, perThousandNeurons: 0.011 },
  containers: {
    includedMemGibSeconds: 25 * 3600,
    perGibSecond: 0.0000025,
    includedVcpuSeconds: 375 * 60,
    perVcpuSecond: 0.00002,
    includedDiskGbSeconds: 200 * 3600,
    perDiskGbSecond: 0.00000007,
  },
};

const over = (used, free) => Math.max(0, (used ?? 0) - free);

/**
 * Prices a usage record. `allowances: false` ignores the included quantities
 * (used for per-service sub-budgets, which would otherwise look free).
 * `daysElapsed` is how many days of the month have passed (for the AI daily
 * allowance).
 */
export function price(usage, { allowances = true, daysElapsed = 1 } = {}) {
  const f = allowances ? 1 : 0;
  const R = RATES;
  const lines = {
    workersRequests:
      (over(usage.workersRequests, R.workers.includedRequests * f) / 1e6) *
      R.workers.perMillionRequests,
    workersCpu:
      (over(usage.workersCpuMs, R.workers.includedCpuMs * f) / 1e6) * R.workers.perMillionCpuMs,
    r2Storage: over(usage.r2StorageGbMonth, R.r2.freeGb * f) * R.r2.perGbMonth,
    r2ClassA: (over(usage.r2ClassA, R.r2.freeClassA * f) / 1e6) * R.r2.perMillionClassA,
    r2ClassB: (over(usage.r2ClassB, R.r2.freeClassB * f) / 1e6) * R.r2.perMillionClassB,
    kvReads: (over(usage.kvReads, R.kv.freeReads * f) / 1e6) * R.kv.perMillionReads,
    kvWrites: (over(usage.kvWrites, R.kv.freeWrites * f) / 1e6) * R.kv.perMillionWrites,
    kvStorage: over(usage.kvStorageGbMonth, R.kv.freeGb * f) * R.kv.perGbMonth,
    doRequests:
      (over(usage.doRequests, R.durableObjects.includedRequests * f) / 1e6) *
      R.durableObjects.perMillionRequests,
    doDuration:
      (over(usage.doGbSeconds, R.durableObjects.includedGbSeconds * f) / 1e6) *
      R.durableObjects.perMillionGbSeconds,
    workersAi:
      (over(usage.aiNeurons, R.workersAi.freeNeuronsPerDay * daysElapsed * f) / 1000) *
      R.workersAi.perThousandNeurons,
    containerMemory:
      over(usage.containerMemGibSeconds, R.containers.includedMemGibSeconds * f) *
      R.containers.perGibSecond,
    containerCpu:
      over(usage.containerVcpuSeconds, R.containers.includedVcpuSeconds * f) *
      R.containers.perVcpuSecond,
    containerDisk:
      over(usage.containerDiskGbSeconds, R.containers.includedDiskGbSeconds * f) *
      R.containers.perDiskGbSecond,
  };
  const total =
    Object.values(lines).reduce((a, b) => a + b, 0) + (allowances ? R.workersPaidPlanUsd : 0);
  return { lines, total };
}
