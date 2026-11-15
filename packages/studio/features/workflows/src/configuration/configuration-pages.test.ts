import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pageForKey } from "./configuration-pages.ts";

verifies("workflows.configuration.pages", () => {
  it("moves down and up the list and wraps round", () => {
    expect(pageForKey("general", "ArrowDown")).toBe("request-form");
    expect(pageForKey("problems", "ArrowDown")).toBe("general");
    expect(pageForKey("general", "ArrowUp")).toBe("problems");
  });

  it("jumps to the ends and ignores other keys", () => {
    expect(pageForKey("request-form", "Home")).toBe("general");
    expect(pageForKey("general", "End")).toBe("problems");
    expect(pageForKey("general", "a")).toBeUndefined();
  });
});
