import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bridgeSocketFolder } from "./socket-folder.ts";

describe("bridgeSocketFolder", () => {
  const profile = join("/srv", "acme", "halonic");

  it("serves sockets in the profile's bridges folder on Linux and macOS", () => {
    expect(bridgeSocketFolder(profile, "linux")).toBe(join(profile, "bridges"));
    expect(bridgeSocketFolder(profile, "darwin")).toBe(join(profile, "bridges"));
  });

  it("keeps the loopback port on Windows, and without a profile folder", () => {
    expect(bridgeSocketFolder(profile, "win32")).toBeUndefined();
    expect(bridgeSocketFolder(undefined, "linux")).toBeUndefined();
  });
});
