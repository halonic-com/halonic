import type { RunSummary } from "@halonicjs/events";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Coordination,
  DefinitionSource,
  DefinitionStore,
  HttpClient,
  RunExecutor,
  RunStore,
  Scheduler,
  SchedulerListener,
  Secrets,
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

describe("ports.read-only-sides", () => {
  it("gives Secrets no way to write", () => {
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

describe("ports.web-types-only", () => {
  it("lets HttpClient be the Web fetch signature", () => {
    expectTypeOf<HttpClient["fetch"]>().toBeCallableWith("https://example.com", {
      method: "POST",
      body: "{}",
    });
    expectTypeOf<Parameters<HttpClient["fetch"]>[0]>().toEqualTypeOf<string>();
    expectTypeOf<HttpClient["fetch"]>().returns.toEqualTypeOf<Promise<Response>>();
    const client: HttpClient = { fetch: async () => new Response("ok") };
    expectTypeOf(client).toEqualTypeOf<HttpClient>();
  });

  it("uses ISO text and plain numbers for times, so every runtime can store them", () => {
    expectTypeOf<Parameters<Scheduler["schedule"]>>().toEqualTypeOf<
      [key: string, timerId: string, at: string]
    >();
    expectTypeOf<Parameters<SchedulerListener["onTick"]>>().toEqualTypeOf<[at: string]>();
    expectTypeOf<Parameters<Coordination["tryAcquire"]>>().toEqualTypeOf<
      [key: string, ttlMs: number]
    >();
  });

  it("checks run log appends against the last sequence number", () => {
    expectTypeOf<Parameters<RunStore["append"]>[1]>().toEqualTypeOf<number>();
    expectTypeOf<ReturnType<RunExecutor["start"]>>().toEqualTypeOf<Promise<RunSummary>>();
  });
});
