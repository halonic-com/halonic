import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { type ConnectorConfig, connectorStartFailureOf } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { unusedRunners } from "../pinned/fake-runners.spec.ts";
import { runnerRefusedError } from "../pinned/find-runner.ts";
import { McpStoppedError } from "../protocol/errors.ts";
import { McpSession } from "../protocol/session.ts";
import { contractServer, FakeProgram, FakeStarter, unusedFolders } from "./fake-program.spec.ts";
import { nodeProgramStarter } from "./node-program-starter.ts";
import { ProgramNotFoundError, SecretNotSetError } from "./start-errors.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";
import { StdioTransport } from "./stdio-transport.ts";

afterEach(() => {
  vi.useRealTimers();
});

/** A program that reads its requests and never answers. */
function silentTransport() {
  const launch = { program: "notes-mcp", args: [], env: {}, checkedEnv: {}, cwd: tmpdir() };
  const program = new FakeProgram(launch, () => undefined);
  const limits = { requestTimeoutMs: 5000, maxMessageBytes: 1024, stopGraceMs: 100 };
  return { program, transport: new StdioTransport(program, limits) };
}

verifies("mcp.connector-start-errors", () => {
  it("names a program the PATH doesn't have", async () => {
    const launch = { program: "acme-missing", args: [], env: { PATH: "" }, checkedEnv: {} };
    const refused = await nodeProgramStarter
      .start({ ...launch, cwd: tmpdir() })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ProgramNotFoundError);
    expect(refused).toMatchObject({
      program: "acme-missing",
      message: "The program acme-missing was not found in any absolute folder of the PATH.",
    });
  });

  it("names the runner a pinned connector's lookup didn't find", () => {
    const error = runnerRefusedError("notes", {
      refused: `couldn't find "npx" on this computer; give its full path as the connector's command`,
      missing: "npx",
    });
    expect(error).toBeInstanceOf(ProgramNotFoundError);
    expect(error).toMatchObject({
      program: "npx",
      message: `Halonic didn't start the connector "notes": couldn't find "npx" on this computer; give its full path as the connector's command.`,
    });
  });

  it("keeps any other refused lookup a plain error", () => {
    const error = runnerRefusedError("notes", { refused: `"./npx" is a path relative to …` });
    expect(error).not.toBeInstanceOf(ProgramNotFoundError);
    expect(error.message).toBe(
      `Halonic didn't start the connector "notes": "./npx" is a path relative to ….`,
    );
  });

  it("names a secret that isn't set, never a value", async () => {
    const config: ConnectorConfig = {
      id: "notes",
      transport: { kind: "stdio", command: "notes-mcp", args: [], env: {} },
      secretEnv: { NOTES_TOKEN: "notes-token" },
    };
    const factory = new McpStdioConnectorFactory({
      starter: new FakeStarter(contractServer([])),
      folders: unusedFolders,
      runners: unusedRunners,
      inheritedEnv: { PATH: "/usr/bin" },
      clientInfo: { name: "halonic", version: "0.1.0" },
    });
    const client = factory.create(config, {
      secrets: new MemorySecrets(),
      tokens: new MemoryTokenStore(),
      http: { fetch: async () => new Response("unused") },
      workspaceRoot: resolve("/workspaces/acme"),
      trust: contractGrant,
    });
    const refused = await client.listTools().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(SecretNotSetError);
    expect(refused).toMatchObject({ secretName: "notes-token" });
    await client.close();
  });

  it("says a program stopped when it ends while a request waits", async () => {
    const { program, transport } = silentTransport();
    const session = new McpSession(transport, { clientInfo: { name: "halonic", version: "0" } });
    const opening = session.initialize();
    program.exit(1);
    await expect(opening).rejects.toBeInstanceOf(McpStoppedError);
    await expect(opening).rejects.toMatchObject({ code: "unavailable" });
    await transport.close();
  });

  it("says a program stopped when it doesn't answer in time", async () => {
    vi.useFakeTimers();
    const { transport } = silentTransport();
    const session = new McpSession(transport, { clientInfo: { name: "halonic", version: "0" } });
    const failure = expect(session.initialize()).rejects.toBeInstanceOf(McpStoppedError);
    await vi.advanceTimersByTimeAsync(5000);
    await failure;
  });
});

verifies("ports.connector-start-failure", () => {
  it("throws start errors the engine can read without this adapter", () => {
    expect(connectorStartFailureOf(new ProgramNotFoundError("npx"))).toEqual({
      reason: "program-missing",
      program: "npx",
    });
    expect(connectorStartFailureOf(new SecretNotSetError("notes", "notes-token"))).toEqual({
      reason: "secret-not-set",
      secret: "notes-token",
    });
  });
});
