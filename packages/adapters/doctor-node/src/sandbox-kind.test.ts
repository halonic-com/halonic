import { expect, it } from "vitest";
import { sandboxKindOf } from "./sandbox-kind.ts";

it("names the sandbox srt runs on each system", () => {
  expect(sandboxKindOf("linux")).toBe("bubblewrap");
  expect(sandboxKindOf("darwin")).toBe("seatbelt");
  expect(sandboxKindOf("win32")).toBe("windows");
});

it("names no sandbox on a system srt doesn't run on", () => {
  expect(sandboxKindOf("freebsd")).toBeUndefined();
});
