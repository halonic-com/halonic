import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  type ConnectorFacts,
  connectionStateOf,
  connectionStateTable,
} from "./connection-state.ts";

const healthy: ConnectorFacts = {
  configured: true,
  signedIn: true,
  secretValid: true,
  apiOn: true,
};

verifies("library.connection-state", () => {
  it("is connected when nothing is wrong", () => {
    expect(connectionStateOf(healthy)).toBe("connected");
  });

  it("is not connected when the connector is not set up, whatever else is true", () => {
    expect(connectionStateOf({ ...healthy, configured: false, secretValid: false })).toBe(
      "not-connected",
    );
  });

  it("names the one to fix first: the secret, then the sign-in, then the API", () => {
    const allWrong = { ...healthy, signedIn: false, secretValid: false, apiOn: false };
    expect(connectionStateOf(allWrong)).toBe("needs-new-secret");
    expect(connectionStateOf({ ...allWrong, secretValid: true })).toBe("needs-sign-in");
    expect(connectionStateOf({ ...allWrong, secretValid: true, signedIn: true })).toBe("api-off");
  });

  it("gives every state a label and a tone", () => {
    expect(connectionStateTable.connected).toEqual({ label: "Connected", tone: "success" });
    expect(connectionStateTable["needs-sign-in"].label).toBe("Needs sign-in");
    expect(connectionStateTable["needs-new-secret"].label).toBe("Needs new secret");
    expect(connectionStateTable["api-off"].label).toBe("API off");
    expect(connectionStateTable["not-connected"]).toEqual({
      label: "Not connected",
      tone: "attention",
    });
    for (const state of ["needs-sign-in", "needs-new-secret", "api-off"] as const) {
      expect(connectionStateTable[state].tone).toBe("attention");
    }
  });
});
