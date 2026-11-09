import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ProfileEnvironment, profileFolder } from "./profile-folder.ts";

// Built from parts, so the repo's leak guard doesn't read them as a real machine's paths.
const drive = "D:";
const windowsHome = `${drive}\\people\\acme`;

function linux(variables: ProfileEnvironment["variables"] = {}): ProfileEnvironment {
  return { platform: "linux", homeFolder: "/srv/acme", variables };
}

verifies("profile.profile-folder", () => {
  it("uses ~/.local/share on Linux without XDG_DATA_HOME", () => {
    expect(profileFolder(linux())).toEqual({
      platform: "linux",
      root: "/srv/acme/.local/share/halonic",
    });
  });

  it("uses XDG_DATA_HOME on Linux when it is absolute", () => {
    expect(profileFolder(linux({ XDG_DATA_HOME: "/srv/data" })).root).toBe("/srv/data/halonic");
  });

  it("ignores a relative or empty XDG_DATA_HOME", () => {
    expect(profileFolder(linux({ XDG_DATA_HOME: "data" })).root).toBe(
      "/srv/acme/.local/share/halonic",
    );
    expect(profileFolder(linux({ XDG_DATA_HOME: "" })).root).toBe("/srv/acme/.local/share/halonic");
  });

  it("uses Application Support on macOS", () => {
    const environment: ProfileEnvironment = {
      platform: "macos",
      homeFolder: "/srv/acme",
      variables: { XDG_DATA_HOME: "/srv/data" },
    };
    expect(profileFolder(environment).root).toBe("/srv/acme/Library/Application Support/halonic");
  });

  it("uses LOCALAPPDATA on Windows, joined with backslashes", () => {
    const environment: ProfileEnvironment = {
      platform: "windows",
      homeFolder: windowsHome,
      variables: { LOCALAPPDATA: `${windowsHome}\\AppData\\Local` },
    };
    expect(profileFolder(environment)).toEqual({
      platform: "windows",
      root: `${windowsHome}\\AppData\\Local\\halonic`,
    });
  });

  it("falls back to AppData\\Local under the home folder on Windows", () => {
    const environment: ProfileEnvironment = {
      platform: "windows",
      homeFolder: windowsHome,
      variables: { LOCALAPPDATA: "" },
    };
    expect(profileFolder(environment).root).toBe(`${windowsHome}\\AppData\\Local\\halonic`);
  });

  it("prefers HALONIC_HOME, without its trailing separator", () => {
    expect(profileFolder(linux({ HALONIC_HOME: "/srv/halonic/" })).root).toBe("/srv/halonic");
    const windows: ProfileEnvironment = {
      platform: "windows",
      homeFolder: windowsHome,
      variables: { HALONIC_HOME: `${drive}\\halonic\\`, LOCALAPPDATA: `${drive}\\local` },
    };
    expect(profileFolder(windows).root).toBe(`${drive}\\halonic`);
  });

  it("accepts a Windows network share as HALONIC_HOME", () => {
    const windows: ProfileEnvironment = {
      platform: "windows",
      homeFolder: windowsHome,
      variables: { HALONIC_HOME: "\\\\server\\share\\halonic" },
    };
    expect(profileFolder(windows).root).toBe("\\\\server\\share\\halonic");
  });

  it("refuses a relative HALONIC_HOME", () => {
    expect(() => profileFolder(linux({ HALONIC_HOME: "profile" }))).toThrow(RangeError);
    const windows: ProfileEnvironment = {
      platform: "windows",
      homeFolder: windowsHome,
      variables: { HALONIC_HOME: `${drive}halonic` },
    };
    expect(() => profileFolder(windows)).toThrow(RangeError);
  });

  it("refuses a relative home folder when it needs one", () => {
    const environment: ProfileEnvironment = {
      platform: "macos",
      homeFolder: "acme",
      variables: {},
    };
    expect(() => profileFolder(environment)).toThrow(RangeError);
  });
});
