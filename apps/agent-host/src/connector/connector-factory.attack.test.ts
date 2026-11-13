import { describe, expect, it } from "vitest";
import { hostConnectorFactory } from "./connector-factory.ts";

/** A host whose sandbox doesn't work, so every start is the unfenced one. */
function unfencedFactory() {
  return hostConnectorFactory({
    sandbox: {
      check: async () => ({ ok: false, reason: "no sandbox in this test" }) as never,
      open: async () => {
        throw new Error("no session in this test");
      },
    },
    version: "0.0.0-test",
    deniedPaths: [],
    env: { PATH: "/usr/bin", HOST_ONLY_VALUE: "not-a-real-secret" },
  });
}

describe("the host's connector factory on an unfenced start", () => {
  it("refuses a connector that names host variables to inherit, and starts nothing", async () => {
    const connector = unfencedFactory().create(
      {
        id: "notes",
        secretEnv: {},
        transport: {
          kind: "stdio",
          command: "node",
          args: ["tools/notes.js"],
          env: {},
          inheritEnv: ["HOST_ONLY_VALUE"],
        },
      },
      { workspaceRoot: "workspace", workingFolders: [] } as never,
    );
    await expect(connector.listTools()).rejects.toThrow(/names variables to take from the host/);
    await connector.close();
  });
});
