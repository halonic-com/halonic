import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorStartFailureOf } from "./index.ts";

/** An error as a connector adapter throws it, built here so the test needs no adapter. */
function adapterError(name: string, fields: Record<string, unknown>, message = "failed"): Error {
  return Object.assign(new Error(message), { name, ...fields });
}

verifies("ports.connector-start-failure", () => {
  it("reads a missing program by its name", () => {
    const error = adapterError("ProgramNotFoundError", { program: "npx" });
    expect(connectorStartFailureOf(error)).toEqual({ reason: "program-missing", program: "npx" });
  });

  it("reads a secret that isn't set by its name, and nothing of the message", () => {
    const error = adapterError(
      "SecretNotSetError",
      { secretName: "NOTES_TOKEN" },
      "Connector needs NOTES_TOKEN, read from the profile folder",
    );
    expect(connectorStartFailureOf(error)).toEqual({
      reason: "secret-not-set",
      secret: "NOTES_TOKEN",
    });
  });

  it("turns away anything else", () => {
    expect(connectorStartFailureOf(new Error("The MCP server stopped."))).toBeUndefined();
    expect(connectorStartFailureOf(adapterError("ProgramNotFoundError", {}))).toBeUndefined();
    expect(
      connectorStartFailureOf(adapterError("SecretNotSetError", { secretName: "" })),
    ).toBeUndefined();
    expect(
      connectorStartFailureOf(adapterError("SecretNotSetError", { secretName: 7 })),
    ).toBeUndefined();
    expect(
      connectorStartFailureOf({ name: "ProgramNotFoundError", program: "npx" }),
    ).toBeUndefined();
  });
});
