import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ConnectorToolError, isConnectorToolError } from "./index.ts";

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
