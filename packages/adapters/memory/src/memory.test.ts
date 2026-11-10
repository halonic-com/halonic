import { TrustService } from "@halonicjs/app";
import type { ConnectorTool, ConnectorTransport, Digest, HttpClient } from "@halonicjs/ports";
import {
  agentPlacementStoreContract,
  blobStoreContract,
  brokenToolName,
  type ConnectorKind,
  clockContract,
  connectionSettingsStoreContract,
  connectorClientContract,
  connectorPinContract,
  contractServerAnswer,
  contractServerTools,
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
  trustServiceAttackContract,
  trustStoreAttackContract,
  trustStoreContract,
  unfencedRunConsentStoreContract,
  type VcsHarness,
  vcsContract,
  vcsHardenedCases,
} from "@halonicjs/testing-contracts";
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";
import { trustContent, trustFingerprint } from "@halonicjs/workspace";
import { describe, it } from "vitest";
import {
  fixedIds,
  ManualClock,
  MemoryAgentPlacementStore,
  MemoryBlobStore,
  MemoryConnectionSettingsStore,
  MemoryConnectorFactory,
  type MemoryConnectorServer,
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
  MemoryUnfencedRunConsentStore,
  MemoryVcs,
  ScriptedLlmProvider,
} from "./index.ts";

// No case may open a TCP connection to another machine: a binding answers
// every outside call from recorded or scripted data.
refuseRealConnections();

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
trustServiceAttackContract(
  "memory",
  makeTrustStore,
  (store) => new TrustService({ store, digest, clock: new ManualClock(), appVersion: "0.1.0" }),
);
agentPlacementStoreContract("memory", async () => {
  const store = new MemoryAgentPlacementStore();
  return { store, damage: async (key) => store.damage(key) };
});
clockContract("memory", async () => new ManualClock());
connectionSettingsStoreContract("memory", async () => {
  const store = new MemoryConnectionSettingsStore();
  return { store, damage: async (key) => store.damage(key) };
});
unfencedRunConsentStoreContract("memory", async () => {
  const store = new MemoryUnfencedRunConsentStore();
  return { store, damage: async () => store.damage() };
});
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
connectorContracts();
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

/**
 * The Vcs suite's view of a memory Vcs over `store`. Private entries go
 * straight into the stores, as a program in the folder could write them.
 */
function memoryHarness(vcs: MemoryVcs, store: MemoryDefinitionStore): VcsHarness {
  return {
    vcs,
    files: store,
    worktreeFiles: (worktree) => vcs.worktreeFiles(worktree.id),
    async writePrivate(worktree, path, content) {
      vcs.worktreeFiles(worktree.id).writePrivate(path, content);
    },
    async commitPrivate(path, content) {
      store.writePrivate(path, content);
      await vcs.commitPrivate(path, content);
    },
    readPrivate: async (path) => store.snapshot()[path] ?? null,
    // Every memory version is a commit; there are no trees or blobs to name.
    nonCommitIds: async () => [],
  };
}

/** A repository on `main` holding `files` in one commit, as the Vcs suite asks for. */
async function memoryRepo(files: Readonly<Record<string, string>>): Promise<VcsHarness> {
  const store = new MemoryDefinitionStore(files);
  return memoryHarness(await committed(store), store);
}

/** A new repository over `store`, with every file it lists in one commit on `main`. */
async function committed(store: MemoryDefinitionStore): Promise<MemoryVcs> {
  const vcs = new MemoryVcs(store);
  await vcs.init();
  await vcs.stage(await store.list());
  await vcs.commit("Initial commit");
  return vcs;
}

/** A folder that is not a repository; memory has no parent folders, so this is also the nested one. */
async function memoryFolder(files: Readonly<Record<string, string>>): Promise<VcsHarness> {
  const store = new MemoryDefinitionStore(files);
  return memoryHarness(new MemoryVcs(store), store);
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
    async worktreeGitFile(worktree) {
      planted.push(`worktree .git file ${worktree.id}`);
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
      const seed = await committed(new MemoryDefinitionStore(files));
      seed.addRemote("origin", remote);
      await seed.push();
      const cloneOf = async (): Promise<VcsHarness> => {
        const store = new MemoryDefinitionStore();
        return withPlant(memoryHarness(await MemoryVcs.clone(remote, store), store));
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

/** The contract's test server, as the memory connector serves it. */
const contractServer: MemoryConnectorServer = {
  tools: contractServerTools,
  answer(name, args) {
    if (name === brokenToolName) throw new Error("The tool failed.");
    return contractServerAnswer(name, args);
  },
};

/** Built-in Google tools, in short: one per risk, as the Google adapter marks them. */
const googleTools: readonly ConnectorTool[] = [
  { name: "gmail_search", description: "Finds mail.", parameters: {}, risk: "read" },
  { name: "gmail_create_draft", description: "Writes a draft.", parameters: {}, risk: "write" },
  { name: "gmail_send_draft", description: "Sends a draft.", parameters: {}, risk: "send" },
];

/** Memory connectors reach no network; a request is a bug in the test. */
const noNetwork: HttpClient = {
  fetch: async (url) => {
    throw new Error(`The memory connector tests reach no network, but asked for ${url}.`);
  },
};

function connectorContracts(): void {
  const transports: Record<ConnectorKind, ConnectorTransport> = {
    http: { kind: "http", url: "https://notes.acme.test/mcp", headers: {} },
    stdio: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
    google: { kind: "google", account: "ana@acme.test", client: "google-client" },
  };
  for (const kind of ["http", "stdio", "google"] satisfies ConnectorKind[]) {
    connectorClientContract("memory", kind, async () => {
      const server =
        kind === "google"
          ? { tools: googleTools, answer: () => "No mail matches." }
          : contractServer;
      const factory = new MemoryConnectorFactory(kind, server);
      return {
        factory,
        config: { id: "notes", transport: { ...transports[kind] }, secretEnv: {} },
        context: {
          secrets: new MemorySecrets({}),
          tokens: new MemoryTokenStore(),
          http: noNetwork,
        },
        reached: () => factory.reached(),
        programs: () => factory.programs(),
        readCall: { name: "gmail_search", args: { query: "invoice" } },
      };
    });
  }
  connectorPinContract("memory", async ({ inheritedEnv }) => {
    const factory = new MemoryConnectorFactory("stdio", contractServer, { inheritedEnv });
    return {
      factory,
      context: {
        secrets: new MemorySecrets({}),
        tokens: new MemoryTokenStore(),
        workspaceRoot: "/workspaces/acme",
      },
      launches: () => factory.launches(),
    };
  });
}
