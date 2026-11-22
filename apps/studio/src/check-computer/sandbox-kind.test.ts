import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sandboxKindOf } from "./sandbox-kind.ts";

verifies("studio.check-computer.source", () => {
  it("names the sandbox as halonic doctor does, and none where the page can't tell", () => {
    expect(sandboxKindOf("macos")).toBe("Seatbelt");
    expect(sandboxKindOf("linux")).toBe("bubblewrap");
    expect(sandboxKindOf("windows")).toBeUndefined();
  });
});
