import { ConnectorToolTimeoutError } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { McpError, McpStoppedError } from "../protocol/errors.ts";
import { type McpTool, toolMetaKeys } from "../protocol/protocol.ts";
import { resultText, toConnectorTool, toolTimeoutOf } from "./tool-mapping.ts";

const inputSchema: McpTool["inputSchema"] = { type: "object" };

verifies("mcp.stdio-connector", () => {
  describe("a server's tool as a connector tool", () => {
    it("keeps the risk and untrusted flag the server wrote in its _meta", () => {
      const tool: McpTool = {
        name: "send_invoice",
        description: "Sends an invoice to an acme customer.",
        inputSchema,
        _meta: { [toolMetaKeys.risk]: "send", [toolMetaKeys.untrusted]: false },
      };
      expect(toConnectorTool(tool)).toEqual({
        name: "send_invoice",
        description: "Sends an invoice to an acme customer.",
        parameters: inputSchema,
        risk: "send",
        untrusted: false,
      });
    });

    it("leaves risk and untrusted out, and the description empty, when the server wrote none", () => {
      const connectorTool = toConnectorTool({ name: "list_invoices", inputSchema });
      expect(connectorTool).toEqual({
        name: "list_invoices",
        description: "",
        parameters: inputSchema,
      });
      expect("risk" in connectorTool).toBe(false);
      expect("untrusted" in connectorTool).toBe(false);
    });
  });

  describe("a tool's answer as text", () => {
    it("keeps its text parts in order and names every other kind", () => {
      const text = resultText({
        content: [
          { type: "text", text: "2 invoices" },
          { type: "other", kind: "image" },
          { type: "text", text: "both paid" },
        ],
        isError: false,
      });
      expect(text).toBe("2 invoices\n[image content]\nboth paid");
    });

    it("is empty when the tool answered with nothing", () => {
      expect(resultText({ content: [], isError: false })).toBe("");
    });
  });
});

verifies("mcp.tool-call-timeout", () => {
  describe("the engine's error for a tool call that timed out", () => {
    const timedOut = new McpStoppedError("The MCP server didn't answer in time.", {
      timeoutMs: 1500,
    });

    it("names the connector, the tool and the time limit, keeping the transport's error as its cause", () => {
      const error = toolTimeoutOf("acme-mail", "send_invoice", timedOut, false);
      expect(error).toBeInstanceOf(ConnectorToolTimeoutError);
      expect(error?.message).toBe(
        `Connector "acme-mail"'s tool "send_invoice" didn't answer within 1.5 seconds.`,
      );
      expect(error?.cause).toBe(timedOut);
    });

    it("says the program was stopped and starts again when the connector stopped it", () => {
      const error = toolTimeoutOf("acme-mail", "send_invoice", timedOut, true);
      expect(error?.message).toBe(
        `Connector "acme-mail"'s tool "send_invoice" didn't answer within 1.5 seconds, so Halonic stopped its program. The next call starts it again.`,
      );
    });

    it("is undefined for an MCP error without a time limit or any other error", () => {
      const refused = new McpError("not-allowed", "The MCP server doesn't allow this.");
      expect(toolTimeoutOf("acme-mail", "send_invoice", refused, true)).toBeUndefined();
      expect(toolTimeoutOf("acme-mail", "send_invoice", new Error("boom"), true)).toBeUndefined();
      expect(toolTimeoutOf("acme-mail", "send_invoice", undefined, false)).toBeUndefined();
    });
  });
});
