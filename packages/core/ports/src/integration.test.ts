import { typeTest } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ConnectorTool,
  HttpClient,
  Integration,
  IntegrationHost,
  IntegrationTool,
  SecretPlacement,
  ToolRisk,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const host: IntegrationHost = {
  http: { fetch: async () => new Response("ok") },
  tokens: { get: async () => null, set: async () => {}, remove: async () => {} },
  settings: {},
};

describe("ports.integration-host", () => {
  typeTest("gives an integration http, tokens and settings, and no secrets", () => {
    expectTypeOf<keyof IntegrationHost>().toEqualTypeOf<"http" | "tokens" | "settings">();
    // @ts-expect-error: an integration never gets the Secrets port
    host.secrets?.get("example-key");
  });

  it("lets the limited client stand in for an HttpClient, with secrets named and not passed", async () => {
    const plain: HttpClient = host.http;
    expectTypeOf(host.http.fetch).toBeCallableWith("https://api.example.com/v1", {
      auth: { secret: "example-key", as: "bearer" },
    });
    expectTypeOf(host.http.fetch).toBeCallableWith("https://oauth.example.com/token", {
      method: "POST",
      auth: [
        { secret: "client-id", as: "form", field: "client_id" },
        { secret: "client-secret", as: "form", field: "client_secret" },
      ],
    });
    // @ts-expect-error: a placement names the secret, it has no value field
    const withValue: SecretPlacement = { secret: "example-key", as: "bearer", value: "sk-1" };
    expect(withValue.secret).toBe("example-key");
    expect((await plain.fetch("https://api.example.com/v1")).ok).toBe(true);
  });

  it("requires a risk of read, write or send on every integration tool", () => {
    expectTypeOf<IntegrationTool["risk"]>().toEqualTypeOf<ToolRisk>();
    expectTypeOf<ToolRisk>().toEqualTypeOf<"read" | "write" | "send">();
    // @ts-expect-error: an integration tool must declare its risk
    const noRisk: IntegrationTool = { name: "a", description: "", parameters: {} };
    const badRisk: IntegrationTool = {
      name: "b",
      description: "",
      parameters: {},
      // @ts-expect-error: "delete" is not a risk
      risk: "delete",
    };
    expect([noRisk.name, badRisk.name]).toEqual(["a", "b"]);
  });

  it("keeps connector tools without risk or untrusted compiling", () => {
    const old: ConnectorTool = { name: "search", description: "Search", parameters: {} };
    const tool: IntegrationTool = { ...old, risk: "read", untrusted: true };
    const asConnectorTool: ConnectorTool = tool;
    expect(asConnectorTool.risk).toBe("read");
    expect(old.risk).toBeUndefined();
  });

  it("connects an integration through its host and calls a declared tool", async () => {
    const echo: Integration = {
      name: "echo",
      version: "1.0.0",
      tools: [{ name: "echo", description: "Echo", parameters: {}, risk: "read" }],
      connect: (given) => ({
        callTool: async (_name, args) =>
          (await given.http.fetch(`https://api.example.com/${String(args["text"])}`)).text(),
        close: async () => {},
      }),
    };
    const connection = echo.connect(host);
    expect(await connection.callTool("echo", { text: "hi" })).toBe("ok");
    expect(connection.listTools).toBeUndefined();
    await connection.close();
  });
});
