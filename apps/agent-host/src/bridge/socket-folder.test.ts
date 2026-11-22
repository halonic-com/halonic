import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { bridgeSocketFolder, socketFolderFor } from "./socket-folder.ts";

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

verifies("agent-host.bridge-place", () => {
  describe("socketFolderFor", () => {
    const sockets = join("/srv", "acme", "halonic", "bridges");

    it("keeps a sandboxed run's bridge in the socket folder", () => {
      expect(socketFolderFor("sandbox", sockets)).toBe(sockets);
    });

    it("serves the bridge of a run on this computer on a loopback port, wherever sockets are served", () => {
      expect(socketFolderFor("this-computer", sockets)).toBeUndefined();
      expect(socketFolderFor("this-computer", undefined)).toBeUndefined();
      expect(socketFolderFor("sandbox", undefined)).toBeUndefined();
    });
  });
});
