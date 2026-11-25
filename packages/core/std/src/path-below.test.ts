import { describe, expect, it } from "vitest";
import { pathBelow } from "./path-below.ts";

/** A Windows path from its names, such as `windows("C:", "Acme")`. */
function windows(...names: string[]): string {
  return names.join("\\");
}

describe("pathBelow", () => {
  it("joins with / below a macOS or Linux folder", () => {
    expect(pathBelow("/srv/acme", "settings", "home")).toBe("/srv/acme/settings/home");
  });

  it("joins with \\ below a Windows folder, whichever separator it was written with", () => {
    expect(pathBelow(windows("C:", "Acme"), "settings", "home")).toBe(
      windows("C:", "Acme", "settings", "home"),
    );
    expect(pathBelow("C:/Acme", "settings")).toBe(windows("C:/Acme", "settings"));
    expect(pathBelow(windows("", "", "server", "share"), "acme")).toBe(
      windows("", "", "server", "share", "acme"),
    );
    expect(pathBelow(windows("", "agents", "writer"), "home")).toBe(
      windows("", "agents", "writer", "home"),
    );
  });

  it("drops separators at the folder's end but keeps a root's own", () => {
    expect(pathBelow("/srv/acme//", "home")).toBe("/srv/acme/home");
    expect(pathBelow(windows("C:", "Acme", ""), "home")).toBe(windows("C:", "Acme", "home"));
    expect(pathBelow("/", "home")).toBe("/home");
    expect(pathBelow(windows("C:", ""), "home")).toBe(windows("C:", "home"));
  });

  it("gives the folder back when there are no names", () => {
    expect(pathBelow("/srv/acme/")).toBe("/srv/acme");
    expect(pathBelow(windows("C:", ""))).toBe(windows("C:", ""));
  });
});
