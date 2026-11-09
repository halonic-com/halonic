import {
  blobStoreContract,
  clockContract,
  coordinationContract,
  definitionStoreContract,
  idGeneratorContract,
  type MakeVcs,
  type PlantGitCode,
  recordStoreContract,
  runStoreContract,
  schedulerContract,
  secretsContract,
  tokenStoreContract,
  type VcsHarness,
  vcsContract,
  vcsHardenedCases,
} from "@halonicjs/testing-contracts";
import { describe, it } from "vitest";
import {
  fixedIds,
  ManualClock,
  MemoryBlobStore,
  MemoryCoordination,
  MemoryDefinitionStore,
  MemoryRecordStore,
  MemoryRemote,
  MemoryRunStore,
  MemoryScheduler,
  MemorySecrets,
  MemoryTokenStore,
  MemoryVcs,
} from "./index.ts";

// The old memory.test.ts ran the old contracts against these adapters; this file does the same.
definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
runStoreContract("memory", async () => new MemoryRunStore());
blobStoreContract("memory", async () => new MemoryBlobStore());
recordStoreContract("memory", async () => new MemoryRecordStore());
secretsContract("memory", async (values) => new MemorySecrets(values));
tokenStoreContract("memory", async () => new MemoryTokenStore());
clockContract("memory", async () => new ManualClock());
idGeneratorContract("memory", async () => fixedIds());
for (const duplicateDeliveries of [false, true]) {
  const name = duplicateDeliveries ? "memory, delivering every timer twice" : "memory";
  schedulerContract(name, async (listener) => {
    const clock = new ManualClock();
    const scheduler = new MemoryScheduler(listener, clock, { duplicateDeliveries });
    return { scheduler, clock, settle: () => scheduler.runDue() };
  });
}
coordinationContract("memory", async () => {
  const clock = new ManualClock();
  return { coordination: new MemoryCoordination(clock), clock };
});

/** A repository on `main` holding `files` in one commit, as the Vcs suite asks for. */
async function memoryRepo(
  files: Readonly<Record<string, string>>,
): Promise<{ vcs: MemoryVcs; files: MemoryDefinitionStore }> {
  const store = new MemoryDefinitionStore(files);
  const vcs = new MemoryVcs(store);
  await vcs.init();
  await vcs.stage(await store.list());
  await vcs.commit("Initial commit");
  return { vcs, files: store };
}

/** A folder that is not a repository; memory has no parent folders, so this is also the nested one. */
async function memoryFolder(files: Readonly<Record<string, string>>): Promise<VcsHarness> {
  const store = new MemoryDefinitionStore(files);
  return { vcs: new MemoryVcs(store), files: store };
}

/**
 * Planted code for a Vcs that runs no programs: it is only recorded. With
 * `leaks`, `ran` says it ran once anything is planted, as if the adapter had
 * run it; the self-test below shows every hardened case then fails.
 */
function recordedPlant(leaks: boolean): PlantGitCode {
  const planted: string[] = [];
  return {
    async hook(name) {
      planted.push(`hook ${name}`);
    },
    async config(key) {
      planted.push(`config ${key}`);
    },
    async attributes(line) {
      planted.push(`attributes ${line}`);
    },
    async ran() {
      return leaks && planted.length > 0;
    },
  };
}

/** The memory Vcs for the suite; with `plant`, as if it drove git and every folder came with that plant. */
function memoryVcs(plant?: () => PlantGitCode): MakeVcs {
  const withPlant = (harness: VcsHarness): VcsHarness =>
    plant === undefined ? harness : { ...harness, plant: plant() };
  return {
    drivesGit: plant !== undefined,
    folder: async (files) => withPlant(await memoryFolder(files)),
    nested: async (files) => withPlant(await memoryFolder(files)),
    repo: async (files) => withPlant(await memoryRepo(files)),
    async clones(files) {
      const remote = new MemoryRemote();
      const seed = await memoryRepo(files);
      seed.vcs.addRemote("origin", remote);
      await seed.vcs.push();
      const cloneOf = async (): Promise<VcsHarness> => {
        const store = new MemoryDefinitionStore();
        return withPlant({ vcs: await MemoryVcs.clone(remote, store), files: store });
      };
      return [await cloneOf(), await cloneOf()];
    },
  };
}

vcsContract("memory", memoryVcs());
// The memory Vcs runs no programs, so nothing planted can run: this only runs the hardened cases' own code.
vcsContract(
  "memory, with planted code recorded",
  memoryVcs(() => recordedPlant(false)),
);
describe("Vcs hardened contract: fails when planted code runs", () => {
  vcsHardenedCases(
    memoryVcs(() => recordedPlant(true)),
    it.fails,
  );
});
