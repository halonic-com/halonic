import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  ConnectorToolError,
  ConnectorToolTimeoutError,
  isConnectorToolError,
  isConnectorToolTimeout,
} from "./index.ts";

verifies("ports.connector-tool-error", () => {
  it("names the connector and the tool, and keeps the tool's own text apart", () => {
    const error = new ConnectorToolError(
      "handbook-files",
      "read_text_file",
      "ENOENT: no such file",
    );
    expect(isConnectorToolError(error)).toBe(true);
    expect(error.name).toBe("ConnectorToolError");
    expect(error.message).toBe('Connector "handbook-files" says its tool "read_text_file" failed.');
    expect(error.toolText).toBe("ENOENT: no such file");
  });

  it("recognises the error from another copy of the package by name and tool text", () => {
    const fromOtherCopy = Object.assign(new Error("from another copy"), {
      name: "ConnectorToolError",
      toolText: "ENOENT",
    });
    expect(isConnectorToolError(fromOtherCopy)).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isConnectorToolError(new Error("The MCP server stopped."))).toBe(false);
    expect(
      isConnectorToolError(Object.assign(new Error("x"), { name: "ConnectorToolError" })),
    ).toBe(false);
    expect(isConnectorToolError({ name: "ConnectorToolError", toolText: "ENOENT" })).toBe(false);
  });
});

verifies("ports.connector-tool-timeout", () => {
  it("keeps Halonic's message and how long the connector waited", () => {
    const error = new ConnectorToolTimeoutError(
      'The tool "search" didn\'t answer within 60 seconds.',
      60_000,
    );
    expect(isConnectorToolTimeout(error)).toBe(true);
    expect(error.name).toBe("ConnectorToolTimeoutError");
    expect(error.message).toBe('The tool "search" didn\'t answer within 60 seconds.');
    expect(error.withinMs).toBe(60_000);
    expect(isConnectorToolError(error)).toBe(false);
  });

  it("keeps the connector's own error as its cause", () => {
    const stopped = new Error("The program didn't answer tools/call within 60 seconds.");
    const error = new ConnectorToolTimeoutError("It timed out.", 60_000, { cause: stopped });
    expect(error.cause).toBe(stopped);
  });

  it("recognises the error from another copy of the package by name and time", () => {
    const fromOtherCopy = Object.assign(new Error("from another copy"), {
      name: "ConnectorToolTimeoutError",
      withinMs: 30_000,
    });
    expect(isConnectorToolTimeout(fromOtherCopy)).toBe(true);
  });

  it("turns away anything else", () => {
    const named = (withinMs: unknown) =>
      Object.assign(new Error("x"), { name: "ConnectorToolTimeoutError", withinMs });
    expect(isConnectorToolTimeout(new Error("The MCP server didn't answer."))).toBe(false);
    expect(isConnectorToolTimeout(named(undefined))).toBe(false);
    expect(isConnectorToolTimeout(named(0))).toBe(false);
    expect(isConnectorToolTimeout(named(Number.POSITIVE_INFINITY))).toBe(false);
    expect(isConnectorToolTimeout(named("60000"))).toBe(false);
    expect(isConnectorToolTimeout({ name: "ConnectorToolTimeoutError", withinMs: 1000 })).toBe(
      false,
    );
  });
});
