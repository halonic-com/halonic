import { isConnectorToolTimeout } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { config, setUp } from "./connector-setup.spec.ts";
import { mcpProgram, testSetup } from "./fake-mcp-program.spec.ts";

verifies("connector-stdio-sandbox.call-timeout-cause", () => {
  it("throws the engine's timeout for a call past callTimeoutMs, with its own error as the cause", async () => {
    const program = mcpProgram(({ method }, { answer }) => {
      if (method === "initialize") {
        answer({ protocolVersion: "2025-11-25", capabilities: { tools: {} } });
      }
      // A call is never answered.
      return undefined;
    });
    const { sandbox, factory, context } = setUp({
      program,
      factory: { localTools: () => ({ ...testSetup, callTimeoutMs: 50 }) },
    });
    const client = factory.create(config, context);
    const error = await client.callTool("read_note", {}).catch((caught: unknown) => caught);

    expect(isConnectorToolTimeout(error)).toBe(true);
    expect(error).toMatchObject({
      withinMs: 50,
      message: `Connector "notes"'s tool "read_note" didn't answer within 0.05 seconds, so Halonic stopped its program. The next call starts it again.`,
    });
    expect((error as Error).cause).toBeInstanceOf(Error);
    await waitUntil("sandbox.running to be 0", () => sandbox.running === 0);
    await client.close();
  });
});
