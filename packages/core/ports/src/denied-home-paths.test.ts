import { deniedPathGroupCodes } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deniedHomePaths, homePathsOf, isDeniedHomePath } from "./index.ts";

verifies("ports.denied-home-paths", () => {
  it("lists every denied group but Halonic's own data", () => {
    expect(Object.keys(deniedHomePaths).sort()).toEqual(
      deniedPathGroupCodes.filter((code) => code !== "halonic-data").sort(),
    );
  });

  it.each([
    ".ssh",
    ".ssh/id_ed25519",
    "keys/.aws/credentials",
    "x/.config/gcloud",
    ".npmrc",
    ".SSH",
    ".ssh.",
    "AppData/Roaming/gcloud/a.db",
    "Library/Keychains/login.keychain-db",
  ])("denies %s", (path) => {
    expect(isDeniedHomePath(path)).toBe(true);
  });

  it.each([".config", ".config/app.json", ".sshrc", "notes/ssh", "gcloud", "AppData/Roaming"])(
    "doesn't deny %s",
    (path) => {
      expect(isDeniedHomePath(path)).toBe(false);
    },
  );

  it("gives each system its own paths, and every system's when none is named", () => {
    const browser = deniedHomePaths["browser-data"];
    expect(homePathsOf(browser, "linux")).toContain(".mozilla");
    expect(homePathsOf(browser, "linux")).not.toContain("AppData/Roaming/Mozilla");
    expect(homePathsOf(browser, "win32")).toContain("AppData/Roaming/Mozilla");
    expect(homePathsOf(browser, "win32")).not.toContain(".mozilla");
    expect(homePathsOf(browser)).toEqual(
      expect.arrayContaining([".mozilla", "AppData/Roaming/Mozilla", "Library/Safari"]),
    );
  });
});
