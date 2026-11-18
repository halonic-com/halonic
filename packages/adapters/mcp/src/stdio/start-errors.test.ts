import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import type { ConnectorConfig } from "@halonicjs/ports";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { unusedRunners } from "../pinned/fake-runners.spec.ts";
import { runnerRefusedError } from "../pinned/find-runner.ts";
import { contractServer, FakeStarter, unusedFolders } from "./fake-program.spec.ts";
import { nodeProgramStarter } from "./node-program-starter.ts";
import { ProgramNotFoundError, SecretNotSetError } from "./start-errors.ts";
import { McpStdioConnectorFactory } from "./stdio-connector.ts";

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
});
