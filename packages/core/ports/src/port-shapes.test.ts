import type { RunEventBody, RunEventType, RunSummary } from "@halonicjs/events";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  ChatTurnRequest,
  Coordination,
  DefinitionSource,
  DefinitionStore,
  Harness,
  HarnessDetection,
  HarnessEvent,
  HarnessSignIn,
  HttpClient,
  KnowledgeProvider,
  RunEventListener,
  RunExecutor,
  RunFilter,
  RunSnapshot,
  RunStore,
  Sandbox,
  SandboxBlock,
  SandboxCapabilities,
  SandboxCheck,
  SandboxFence,
  SandboxProcess,
  SandboxProfile,
  SandboxSession,
  Scheduler,
  SchedulerFactory,
  SchedulerListener,
  Secrets,
  SendOptions,
  StartAgentRequest,
  StartRunRequest,
  TokenStore,
} from "./index.ts";
import { sandboxUnavailableReasons } from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const definitions: DefinitionStore = {
  location: "memory:test",
  list: async () => ["workspace.yaml"],
  read: async () => "id: acme\n",
  version: async () => "v1",
  write: async () => ({ status: "written" }),
  remove: async () => {},
  watch: async () => ({ close: async () => {} }),
};

verifies("ports.read-only-sides", () => {
  typeTest("gives Secrets no way to write", () => {
    const secrets: Secrets = { get: async () => null };
    // @ts-expect-error: configured secrets are read-only at run time
    secrets.set?.("key", "value");
    expectTypeOf<keyof Secrets>().toEqualTypeOf<"get">();
    expectTypeOf<keyof TokenStore>().toEqualTypeOf<"get" | "set" | "remove">();
  });

  it("gives DefinitionSource no way to write, and accepts a DefinitionStore as one", async () => {
    const source: DefinitionSource = definitions;
    // @ts-expect-error: a definition source can't write
    source.write?.("a.yaml", "x");
    // @ts-expect-error: a definition source can't remove
    source.remove?.("a.yaml");
    expectTypeOf<keyof DefinitionSource>().toEqualTypeOf<
      "location" | "list" | "read" | "version"
    >();
    expect(await source.read("workspace.yaml")).toBe("id: acme\n");
  });
});

verifies("ports.web-types-only", () => {
  typeTest("lets HttpClient be the Web fetch signature", () => {
    expectTypeOf<HttpClient["fetch"]>().toBeCallableWith("https://example.com", {
      method: "POST",
      body: "{}",
    });
    expectTypeOf<Parameters<HttpClient["fetch"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<HttpClient["fetch"]>().returns.toEqualTypeOf<Promise<Response>>();
    const client: HttpClient = { fetch: async () => new Response("ok") };
    expectTypeOf(client).toEqualTypeOf<HttpClient>();
  });

  typeTest("uses ISO text and plain numbers for times, so every runtime can store them", () => {
    expectTypeOf<Parameters<Scheduler["schedule"]>>().toEqualTypeOf<
      [key: string, timerId: string, at: string]
    >();
    expectTypeOf<Parameters<SchedulerListener["onTick"]>>().toEqualTypeOf<[at: string]>();
    expectTypeOf<Parameters<Coordination["tryAcquire"]>>().toEqualTypeOf<
      [key: string, ttlMs: number]
    >();
  });

  typeTest("checks run log appends against the last sequence number", () => {
    expectTypeOf<Parameters<RunStore["append"]>[1]>().toEqualTypeOf<number>();
    expectTypeOf<ReturnType<RunExecutor["start"]>>().toEqualTypeOf<Promise<RunSummary>>();
  });
});

verifies("ports.frozen-inputs", () => {
  it("lets a start choose its run id, and has no parent", () => {
    const run: StartRunRequest = { hubId: "h", workflowId: "w", input: {}, runId: "run_fire_1" };
    const agent: StartAgentRequest = {
      hubId: "h",
      agentId: "a",
      prompt: "hi",
      runId: "run_mail_1",
    };
    expectTypeOf(run.runId).toEqualTypeOf<string | undefined>();
    expectTypeOf(agent.runId).toEqualTypeOf<string | undefined>();
    // @ts-expect-error: subflows are started inside the executor, not through the port
    const child: StartRunRequest = { hubId: "h", workflowId: "w", input: {}, parent: {} };
    expect(child).toBeDefined();
  });

  it("filters the run list by one status or several", () => {
    const one: RunFilter = { status: "running" };
    const several: RunFilter = { status: ["running", "waiting"] };
    expect([one, several]).toHaveLength(2);
  });

  typeTest("writes a snapshot with an append and reads it back", () => {
    expectTypeOf<RunStore["append"]>().toBeCallableWith("run_1", 0, [], { snapshot: { step: 1 } });
    expectTypeOf<RunStore["snapshot"]>().returns.toEqualTypeOf<Promise<RunSnapshot | null>>();
  });

  it("tells a subscriber when the stream ends", () => {
    const listener: RunEventListener = { onEvent: () => {}, onClose: () => {} };
    expectTypeOf(listener.onClose).toBeCallableWith(new Error("connection dropped"));
    expectTypeOf(listener.onClose).toBeCallableWith();
    // @ts-expect-error: a bare function has no way to report the end of the stream
    const bare: RunEventListener = () => {};
    expect(bare).toBeDefined();
  });

  typeTest("builds a scheduler from its listener", () => {
    expectTypeOf<SchedulerFactory>().parameter(0).toEqualTypeOf<SchedulerListener>();
    expectTypeOf<SchedulerFactory>().returns.toEqualTypeOf<Scheduler>();
  });

  typeTest("deletes a coordination value by setting it to null", () => {
    expectTypeOf<Coordination["compareAndSet"]>().toBeCallableWith("k", "old", null);
  });
});

verifies("ports.send-call-id", () => {
  typeTest("names the call an event is meant for", () => {
    expectTypeOf<RunExecutor["send"]>().toBeCallableWith("run_1", "approve", undefined, {
      callId: "call-1",
    });
    expectTypeOf<Parameters<RunExecutor["send"]>[3]>().toEqualTypeOf<SendOptions | undefined>();
  });

  typeTest("keeps the call optional", () => {
    expectTypeOf<RunExecutor["send"]>().toBeCallableWith("run_1", "approve", { ok: true });
    expectTypeOf<RunExecutor["send"]>().toBeCallableWith("run_1", "approve", undefined, {});
  });

  it("takes only a string as the call id", () => {
    // @ts-expect-error: a call id is the engine's string, never a number
    const options: SendOptions = { callId: 1 };
    expect(options).toBeDefined();
  });
});

verifies("ports.run-cancel", () => {
  typeTest("keeps cancel optional, so an executor without it still fits the port", () => {
    const withoutCancel = {
      id: "older",
      start: async () => ({}) as RunSummary,
      startAgent: async () => ({}) as RunSummary,
      send: async () => ({}) as RunSummary,
      subscribe: () => ({ close: () => {} }),
      chatTurn: async () => ({}) as Awaited<ReturnType<RunExecutor["chatTurn"]>>,
    };
    expectTypeOf(withoutCancel).toExtend<RunExecutor>();
  });

  typeTest("cancels a run by its id and gives its summary", () => {
    expectTypeOf<NonNullable<RunExecutor["cancel"]>>().toEqualTypeOf<
      (runId: string) => Promise<RunSummary>
    >();
  });
});

verifies("ports.chat-turn-signal", () => {
  const request: ChatTurnRequest = { hubId: "hub-1", messages: [], tools: [] };

  it("takes an abort signal to cancel the model turn", () => {
    const stop = new AbortController();
    const withSignal: ChatTurnRequest = { ...request, signal: stop.signal };
    expect(withSignal.signal?.aborted).toBe(false);
    expectTypeOf<ChatTurnRequest["signal"]>().toEqualTypeOf<AbortSignal | undefined>();
  });

  it("keeps the signal optional", () => {
    expect(request.signal).toBeUndefined();
  });

  it("takes only an AbortSignal as the signal", () => {
    // @ts-expect-error: a signal is an AbortSignal, never a flag
    const wrong: ChatTurnRequest = { ...request, signal: true };
    expect(wrong).toBeDefined();
  });
});

verifies("ports.untrusted-knowledge", () => {
  const provider: KnowledgeProvider = {
    id: "docs",
    capabilities: { search: true, semantic: false, ingest: false },
    search: async () => [],
    get: async () => null,
  };

  it("lets a knowledge source say whether its content is untrusted", () => {
    const remote: KnowledgeProvider = { ...provider, untrusted: true };
    const own: KnowledgeProvider = { ...provider, untrusted: false };
    expect([remote.untrusted, own.untrusted]).toEqual([true, false]);
    // @ts-expect-error: untrusted is a boolean
    const wrong: KnowledgeProvider = { ...provider, untrusted: "yes" };
    expect(wrong).toBeDefined();
  });

  it("leaves it out for a source that doesn't say, which counts as untrusted", () => {
    expectTypeOf<KnowledgeProvider["untrusted"]>().toEqualTypeOf<boolean | undefined>();
    expect(provider.untrusted ?? true).toBe(true);
  });
});

verifies("ports.sandbox-profile", () => {
  const profile: SandboxProfile = {
    workingFolder: "/data/agents/a",
    tempFolder: "/data/tmp/run_1",
    settingsFolder: null,
    readOnlyPaths: ["/data/workspace/workspace.yaml"],
    deniedPaths: ["/data/home/.ssh"],
    env: { HOME: "/data/tmp/run_1" },
    network: { bridge: { host: "127.0.0.1", port: 4100 }, allowedSites: [] },
    timeLimitMs: 600_000,
  };

  it("takes a profile with a bridge address, no further sites and a time limit", () => {
    expectTypeOf(profile).toEqualTypeOf<SandboxProfile>();
    expectTypeOf<Parameters<Sandbox["open"]>[0]>().toEqualTypeOf<SandboxProfile>();
    expect(profile.network.allowedSites).toEqual([]);
  });

  it("has no way to leave out the time limit or the bridge", () => {
    // @ts-expect-error: a run without a time limit is not allowed
    const noLimit: SandboxProfile = { ...profile, timeLimitMs: undefined };
    // @ts-expect-error: an absent bridge must never mean the whole network
    const noBridge: SandboxProfile = { ...profile, network: { allowedSites: [] } };
    expect([noLimit, noBridge]).toHaveLength(2);
  });

  it("takes a profile with no bridge, said as null", () => {
    const fencedOff: SandboxProfile = { ...profile, network: { bridge: null, allowedSites: [] } };
    expectTypeOf<SandboxProfile["network"]["bridge"]>().toEqualTypeOf<{
      host: string;
      port: number;
    } | null>();
    expect(fencedOff.network.bridge).toBeNull();
  });

  typeTest("gives the program only the variables the profile names", () => {
    expectTypeOf<SandboxProfile["env"]>().toEqualTypeOf<Readonly<Record<string, string>>>();
    expectTypeOf<SandboxProfile["settingsFolder"]>().toEqualTypeOf<string | null>();
  });
});

verifies("ports.sandbox-session", () => {
  it("says how files reach the sandbox and how strong the fence is", () => {
    expectTypeOf<SandboxCapabilities["files"]>().toEqualTypeOf<"shared" | "copied">();
    expectTypeOf<SandboxCapabilities["strength"]>().toEqualTypeOf<
      "os" | "vm" | "remote" | "none"
    >();
    // @ts-expect-error: only shared and copied are ways for files to reach a sandbox
    const wrong: SandboxCapabilities = { files: "mounted", strength: "os" };
    expect(wrong).toBeDefined();
  });

  typeTest("opens a session that starts programs with Web streams", () => {
    expectTypeOf<Sandbox["open"]>().returns.toEqualTypeOf<Promise<SandboxSession>>();
    expectTypeOf<Sandbox["open"]>().toBeCallableWith({} as SandboxProfile, {
      signal: new AbortController().signal,
    });
    expectTypeOf<SandboxSession["start"]>().returns.toEqualTypeOf<Promise<SandboxProcess>>();
    expectTypeOf<SandboxProcess["stdin"]>().toEqualTypeOf<WritableStream<Uint8Array>>();
    expectTypeOf<SandboxProcess["stdout"]>().toEqualTypeOf<ReadableStream<Uint8Array>>();
    expectTypeOf<SandboxProcess["stderr"]>().toEqualTypeOf<ReadableStream<Uint8Array>>();
  });

  it("reports a blocked file or network access", () => {
    const seen: SandboxBlock[] = [
      { kind: "file", path: "/data/home/.ssh/key", access: "read" },
      { kind: "network", host: "example.com", port: 443 },
    ];
    expect(seen.map((block) => block.kind)).toEqual(["file", "network"]);
    // @ts-expect-error: a file block has no host
    const mixed: SandboxBlock = { kind: "file", host: "example.com", access: "read" };
    expect(mixed).toBeDefined();
  });

  typeTest("stops everything on close, and a process never rejects when it ends", () => {
    expectTypeOf<SandboxSession["close"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<SandboxProcess["kill"]>().returns.toEqualTypeOf<Promise<void>>();
    expectTypeOf<SandboxProcess["exited"]>().resolves.toHaveProperty("reason");
  });
});

verifies("ports.sandbox-fence-proof", () => {
  typeTest("a session carries a fence proof that is one of three states", () => {
    expectTypeOf<SandboxSession["fence"]>().toEqualTypeOf<SandboxFence>();
    expectTypeOf<SandboxFence["state"]>().toEqualTypeOf<
      "fenced" | "not-fenced" | "off" | "stopped"
    >();
  });

  it("gives a reason only when the session is not fenced", () => {
    const notFenced: SandboxFence = { state: "not-fenced", reason: "the canary file was readable" };
    expect(notFenced.state).toBe("not-fenced");
    // @ts-expect-error: a session that is not fenced says why
    const noReason: SandboxFence = { state: "not-fenced" };
    expect(noReason).toBeDefined();
    // @ts-expect-error: a fenced session has no reason
    const fencedWithReason: SandboxFence = { state: "fenced", reason: "x" };
    expect(fencedWithReason).toBeDefined();
    // @ts-expect-error: a launcher without a fence has nothing to explain
    const offWithReason: SandboxFence = { state: "off", reason: "x" };
    expect(offWithReason).toBeDefined();
  });
});

verifies("ports.harness-detect", () => {
  it("tells Studio which harness is missing", () => {
    const missing: HarnessDetection = { status: "missing" };
    const old: HarnessDetection = { status: "unsupported", version: "0.9.0", supported: ">=1.0.0" };
    expect([missing.status, old.status]).toEqual(["missing", "unsupported"]);
  });

  it("needs the version on a ready harness", () => {
    const ready: HarnessDetection = { status: "ready", version: "1.4.2" };
    // @ts-expect-error: a ready harness says which version it found
    const unknown: HarnessDetection = { status: "ready" };
    expect([ready, unknown]).toHaveLength(2);
  });
});

verifies("ports.harness-signed-out", () => {
  it("says which version it found when no one is signed in", () => {
    const signedOut: HarnessDetection = { status: "signed-out", version: "2.1.321" };
    expect(signedOut).toEqual({ status: "signed-out", version: "2.1.321" });
  });

  it("needs the version on a signed-out harness", () => {
    // @ts-expect-error: a signed-out harness says which version it found
    const unknown: HarnessDetection = { status: "signed-out" };
    expect(unknown).toBeDefined();
  });
});

verifies("ports.harness-sign-in", () => {
  it("names the program, what it is asked and the variable for the agent's folder", () => {
    const signIn: HarnessSignIn = {
      program: "claude",
      args: ["auth", "login"],
      folderVariable: "CLAUDE_CONFIG_DIR",
    };
    expect(signIn.folderVariable).toBe("CLAUDE_CONFIG_DIR");
  });

  typeTest("is optional, so a harness without a sign-in of its own needs none", () => {
    expectTypeOf<Harness["signIn"]>().toEqualTypeOf<HarnessSignIn | undefined>();
  });
});

verifies("ports.harness-run-events", () => {
  typeTest("uses only run log event types", () => {
    expectTypeOf<HarnessEvent["type"]>().toEqualTypeOf<
      | "agent.started"
      | "llm.request"
      | "llm.response"
      | "llm.fallback"
      | "knowledge.searched"
      | "tool.called"
      | "tool.result"
      | "approval.requested"
      | "agent.finished"
    >();
    expectTypeOf<HarnessEvent["type"]>().toExtend<RunEventType>();
  });

  typeTest("reports token use and cost as the run log has them", () => {
    type HarnessResponse = Extract<HarnessEvent, { type: "llm.response" }>;
    type LoggedResponse = Extract<RunEventBody, { type: "llm.response" }>;
    expectTypeOf<HarnessResponse>().toEqualTypeOf<LoggedResponse>();
  });

  it("leaves the workflow state to the engine and has no events of its own", () => {
    const finished: HarnessEvent = { type: "agent.finished", agent: "writer", output: "done" };
    // @ts-expect-error: the engine adds the workflow state
    const withState: HarnessEvent = { ...finished, state: "draft" };
    // @ts-expect-error: sandbox.blocked comes with the engine wiring, not with the port
    const blocked: HarnessEvent = { type: "sandbox.blocked", path: "/etc/hosts" };
    expect([withState, blocked]).toHaveLength(2);
  });

  it("lets a program ask for approval without a resume record", () => {
    const asked: HarnessEvent = {
      type: "approval.requested",
      agent: "writer",
      tool: "gmail.send",
      args: { to: "team@acme.example" },
      callId: "call_1",
    };
    expect(asked.type).toBe("approval.requested");
  });
});

verifies("ports.sandbox-check-reason", () => {
  it("names a closed list of reasons, with other as the fallback", () => {
    expect(sandboxUnavailableReasons).toEqual([
      "windows",
      "container",
      "user-namespaces-restricted",
      "bubblewrap-missing",
      "linux-tools-missing",
      "other",
    ]);
  });

  it("gives a reason when the sandbox can't start, and null when it can", () => {
    const refused: SandboxCheck = {
      ok: false,
      reason: "user-namespaces-restricted",
      missing: ["unprivileged user namespaces are restricted"],
    };
    const works: SandboxCheck = { ok: true, reason: null, missing: [] };
    expect([refused.reason, works.reason]).toEqual(["user-namespaces-restricted", null]);
  });

  it("doesn't compile with a reason that isn't listed", () => {
    // @ts-expect-error: adapters return only listed reasons
    const unlisted: SandboxCheck = { ok: false, reason: "no-kernel", missing: [] };
    expect(unlisted).toBeDefined();
  });

  it("doesn't compile when ok and reason disagree", () => {
    // @ts-expect-error: a sandbox that can start gives no reason
    const okWithReason: SandboxCheck = { ok: true, reason: "windows", missing: [] };
    // @ts-expect-error: a sandbox that can't start says why
    const refusedWithoutReason: SandboxCheck = { ok: false, reason: null, missing: ["no fence"] };
    // @ts-expect-error: a sandbox that can start misses nothing
    const okMissing: SandboxCheck = { ok: true, reason: null, missing: ["bubblewrap"] };
    expect([okWithReason, refusedWithoutReason, okMissing]).toHaveLength(3);
  });
});
