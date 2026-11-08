import type { RunSummary } from "@halonicjs/events";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  Coordination,
  DefinitionSource,
  DefinitionStore,
  HttpClient,
  KnowledgeProvider,
  RunEventListener,
  RunExecutor,
  RunFilter,
  RunSnapshot,
  RunStore,
  Scheduler,
  SchedulerFactory,
  SchedulerListener,
  Secrets,
  StartAgentRequest,
  StartRunRequest,
  TokenStore,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const definitions: DefinitionStore = {
  location: "memory:test",
  list: async () => ["workspace.yaml"],
  read: async () => "id: acme\n",
  version: async () => "v1",
  write: async () => {},
  remove: async () => {},
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
