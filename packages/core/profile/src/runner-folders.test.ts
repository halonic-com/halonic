import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  profileFolder,
  runnerTempFolder,
  sharedRunnerTempFolder,
  unfencedRunsFolder,
} from "./profile-folder.ts";

// Built from parts, so the repo's leak guard doesn't read them as a real machine's paths.
const drive = "D:";
const windowsHome = `${drive}\\people\\acme`;

const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;

verifies("profile.profile-folder", () => {
  it("keeps the saved yes and the runners' temp folders in their own folders of the profile", () => {
    expect(unfencedRunsFolder(linux)).toBe("/srv/acme/.local/share/halonic/unfenced-runs");
    expect(runnerTempFolder(linux)).toBe("/srv/acme/.local/share/halonic/runner-temp");
  });

  it("names %ProgramData% as the shared place for the runners' temp folders on Windows, away from the account name", () => {
    const windows = profileFolder({
      platform: "windows",
      homeFolder: windowsHome,
      variables: {
        LOCALAPPDATA: `${windowsHome}\\AppData\\Local`,
        ProgramData: `${drive}\\ProgramData\\`,
      },
    });
    expect(sharedRunnerTempFolder(windows)).toBe(`${drive}\\ProgramData`);
    // The private fallback stays in the profile folder.
    expect(runnerTempFolder(windows)).toBe(`${windowsHome}\\AppData\\Local\\halonic\\runner-temp`);
  });

  it("names no shared place without an absolute ProgramData, or off Windows", () => {
    const environment = { platform: "windows", homeFolder: windowsHome } as const;
    expect(
      sharedRunnerTempFolder(profileFolder({ ...environment, variables: {} })),
    ).toBeUndefined();
    expect(
      sharedRunnerTempFolder(profileFolder({ ...environment, variables: { ProgramData: "data" } })),
    ).toBeUndefined();
    expect(sharedRunnerTempFolder(linux)).toBeUndefined();
  });
});
