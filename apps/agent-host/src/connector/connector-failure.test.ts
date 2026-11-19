import { SandboxSessionEndedError } from "@halonicjs/adapter-connector-stdio-sandbox";
import {
  ConnectorStoppedError,
  defaultRestartLimits,
  McpError,
  McpStoppedError,
  ProgramNotFoundError,
  SecretNotSetError,
} from "@halonicjs/adapter-mcp";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { connectorFailureReasonOf } from "./connector-failure.ts";
import { openBody, post, type Setup, startRoutes } from "./connector-routes.test-helper.ts";

let setup: Setup | undefined;

afterEach(async () => {
  await setup?.close();
  setup = undefined;
});

/** The host's answer to a tools request whose connector fails with `error`. */
async function answerTo(error: Error): Promise<{ status: number; text: string }> {
  setup = await startRoutes();
  const opened = await post(setup.url, "/v1/connectors/open", openBody(setup.folders));
  const { connector } = (await opened.json()) as { connector: string };
  const failing = setup.made[0];
  if (failing) failing.failWith = error;
  const response = await post(setup.url, "/v1/connectors/tools", { connector });
  return { status: response.status, text: await response.text() };
}

const fixedMessage =
  "The connector couldn't finish this request. The agent host's log has the detail.";

verifies("agent-host.connector-failure-reasons", () => {
  it.each([
    [new ProgramNotFoundError("npx"), { reason: "program-missing", program: "npx" }],
    [
      new SecretNotSetError("notes", "NOTES_TOKEN"),
      { reason: "secret-missing", secret: "NOTES_TOKEN" },
    ],
    [
      new McpError("not-signed-in", "The MCP server refused the secret."),
      { reason: "secret-refused" },
    ],
    [new McpStoppedError("The program stopped."), { reason: "stopped" }],
  ])("answers %s with its reason and the fixed message", async (error, reason) => {
    const { status, text } = await answerTo(error);
    expect(status).toBe(502);
    expect(JSON.parse(text)).toEqual({
      error: { kind: "connector_failed", message: fixedMessage, ...reason },
    });
    expect(text).not.toContain(error.message);
    expect(setup?.logged.join("")).toContain(error.message);
  });

  it("gives no reason for any other failure", async () => {
    const { text } = await answerTo(
      new McpError("unavailable", "The MCP server is having trouble."),
    );
    expect(JSON.parse(text)).toEqual({
      error: { kind: "connector_failed", message: fixedMessage },
    });
  });

  it("reads each cause from the error's type alone", () => {
    expect(connectorFailureReasonOf(new McpError("not-allowed", "x"))).toEqual({
      reason: "secret-refused",
    });
    expect(
      connectorFailureReasonOf(new ConnectorStoppedError("notes", defaultRestartLimits, [])),
    ).toEqual({ reason: "stopped" });
    expect(connectorFailureReasonOf(new SandboxSessionEndedError("notes"))).toEqual({
      reason: "stopped",
    });
    // Text that reads like a cause isn't one: only the type counts.
    expect(
      connectorFailureReasonOf(new Error("The program npx was not found in any absolute folder.")),
    ).toBeUndefined();
  });
});
