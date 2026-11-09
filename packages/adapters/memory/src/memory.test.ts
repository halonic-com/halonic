import type { Digest } from "@halonicjs/ports";
import {
  blobStoreContract,
  clockContract,
  coordinationContract,
  definitionStoreContract,
  idGeneratorContract,
  knowledgeProviderContract,
  llmProviderContract,
  type MakeVcs,
  type PlantGitCode,
  recordStoreContract,
  resourceProbeContract,
  runStoreContract,
  schedulerContract,
  secretsContract,
  tokenStoreContract,
  trustStoreAttackContract,
  trustStoreContract,
  type VcsHarness,
  vcsContract,
  vcsHardenedCases,
} from "@halonicjs/testing-contracts";
import { trustContent, trustFingerprint } from "@halonicjs/workspace";
import { describe, it } from "vitest";
import {
  fixedIds,
  ManualClock,
  MemoryBlobStore,
  MemoryCoordination,
  MemoryDefinitionStore,
  MemoryKnowledgeProvider,
  MemoryRecordStore,
  MemoryRemote,
  MemoryResourceProbe,
  MemoryRunStore,
  MemoryScheduler,
  MemorySecrets,
  MemoryTokenStore,
  MemoryTrustStore,
  MemoryVcs,
  ScriptedLlmProvider,
} from "./index.ts";

// The old memory.test.ts ran the old contracts against these adapters; this file does the same.
definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
runStoreContract("memory", async () => new MemoryRunStore());
blobStoreContract("memory", async () => new MemoryBlobStore());
recordStoreContract("memory", async () => new MemoryRecordStore());
secretsContract("memory", async (values) => new MemorySecrets(values));
tokenStoreContract("memory", async () => new MemoryTokenStore());
const makeTrustStore = async () => {
  const store = new MemoryTrustStore();
  return { store, damage: async (location: string) => store.damage(location) };
};
trustStoreContract("memory", makeTrustStore);
// The attack cases with the real trust content and fingerprint, hashed by Web Crypto.
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
trustStoreAttackContract("memory", makeTrustStore, async (connectors) => {
  const content = trustContent({ connectors });
  return { content, fingerprint: await trustFingerprint(content, digest) };
});
clockContract("memory", async () => new ManualClock());
resourceProbeContract("memory", async () => {
  const probe = new MemoryResourceProbe({
    childProcesses: [{ pid: 4242, name: "claude", memoryBytes: 180 * 1024 ** 2 }],
  });
  let folders = 0;
  return {
    probe,
    folder: async () => `/memory/folder-${++folders}`,
    writeFile: async (path, bytes) => probe.writeFile(path, bytes),
  };
});
idGeneratorContract("memory", async () => fixedIds());
knowledgeProviderContract("memory", async ({ docs }) => new MemoryKnowledgeProvider(docs), {
  search: true,
  list: true,
});
// A source that can neither search nor list, as a remote one might be: only get is left.
knowledgeProviderContract(
  "memory, with get only",
  async ({ docs }) => {
    const provider = new MemoryKnowledgeProvider(docs, { search: false });
    return {
      id: provider.id,
      capabilities: provider.capabilities,
      search: (query, options) => provider.search(query, options),
      get: (ref) => provider.get(ref),
    };
  },
  { search: false, list: false },
);
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
    async localRemote() {
      planted.push("local remote");
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

for (const streams of [false, true]) {
  llmProviderContract(
    streams ? "memory, streaming" : "memory",
    async () => {
      const provider = new ScriptedLlmProvider({ streaming: streams });
      // The streaming binding adds a replay, so the suite's replay checks run too.
      const replay = { type: "scripted", data: { note: "kept as JSON" } };
      return {
        provider,
        answerNext: (answer) => provider.answerNext(streams ? { ...answer, replay } : answer),
        hangNext: (partialText) => provider.hangNext(partialText),
        refuseNext: () => provider.refuseNext(),
        calls: () => provider.calls(),
      };
    },
    // The plain binding leaves reasoning out, so the suite runs both ways.
    { streams, reasoning: streams },
  );
}
