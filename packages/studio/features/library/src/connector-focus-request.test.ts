import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { requestConnectorTitleFocus, takeConnectorTitleFocus } from "./connector-focus-request.ts";

verifies("library.new-connector", () => {
  it("answers a focus request once, and only for the connector it names", () => {
    requestConnectorTitleFocus({ hub: "support", id: "notes" });
    expect(takeConnectorTitleFocus({ hub: null, id: "notes" })).toBe(false);
    expect(takeConnectorTitleFocus({ hub: "support", id: "notes" })).toBe(true);
    expect(takeConnectorTitleFocus({ hub: "support", id: "notes" })).toBe(false);
  });
});
