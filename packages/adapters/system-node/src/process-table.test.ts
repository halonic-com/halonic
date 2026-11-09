import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { baseName, tableReadBy, wholeNumber } from "./process-table.ts";

const row = { pid: 7, parentPid: 1, name: "zsh", memoryBytes: 8 };

verifies("system-node.resource-probe", () => {
  it("gives a program's name without its folder, for either slash", () => {
    expect(baseName("/usr/bin/zsh")).toBe("zsh");
    expect(baseName("windows-folder\\System32\\cmd.exe")).toBe("cmd.exe");
    expect(baseName("claude")).toBe("claude");
  });

  it("reads only whole numbers 0 or more that fit exactly", () => {
    expect(wholeNumber("42")).toBe(42);
    expect(wholeNumber("0")).toBe(0);
    expect(wholeNumber(undefined)).toBeUndefined();
    expect(wholeNumber("")).toBeUndefined();
    expect(wholeNumber("-3")).toBeUndefined();
    expect(wholeNumber("4.5")).toBeUndefined();
    expect(wholeNumber("9".repeat(20))).toBeUndefined();
  });

  it("names the reader only when it ran as a known pid", () => {
    expect(tableReadBy([row], 12)).toEqual({ rows: [row], readerPid: 12 });
    expect(tableReadBy([row], undefined)).toEqual({ rows: [row] });
  });
});
