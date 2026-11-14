import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isClientId } from "./client-id.ts";

verifies("google-setup.client-id-shape", () => {
  it("takes a client ID", () => {
    expect(isClientId("1234-abc.apps.googleusercontent.com")).toBe(true);
    expect(isClientId("98765-x9y8z7.apps.googleusercontent.com")).toBe(true);
  });

  it("refuses a client secret pasted in its place", () => {
    expect(isClientId("GOCSPX-abc123")).toBe(false);
  });

  it("refuses spaces, capitals, a missing number and a missing ending", () => {
    expect(isClientId("1234-abc.apps.googleusercontent.com ")).toBe(false);
    expect(isClientId("1234 -abc.apps.googleusercontent.com")).toBe(false);
    expect(isClientId("1234-ABC.apps.googleusercontent.com")).toBe(false);
    expect(isClientId("abc.apps.googleusercontent.com")).toBe(false);
    expect(isClientId("1234-abc")).toBe(false);
    expect(isClientId("")).toBe(false);
  });
});
