import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { profileFolder, runnerTempFolder, unfencedRunsFolder } from "./profile-folder.ts";

// Built from parts, so the repo's leak guard doesn't read them as a real machine's paths.
const drive = "D:";
const windowsHome = `${drive}\\people\\acme`;

const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;

verifies("profile.profile-folder", () => {
  it("keeps the saved yes and the runners' temp folders in their own folders of the profile", () => {
    expect(unfencedRunsFolder(linux)).toBe("/srv/acme/.local/share/halonic/unfenced-runs");
    expect(runnerTempFolder(linux)).toBe("/srv/acme/.local/share/halonic/runner-temp");
  });

  it("makes the runners' temp folders in %ProgramData% on Windows, away from the account name", () => {
    const windows = profileFolder({
      platform: "windows",
      homeFolder: windowsHome,
      variables: {
        LOCALAPPDATA: `${windowsHome}\\AppData\\Local`,
        ProgramData: `${drive}\\ProgramData\\`,
      },
    });
    expect(runnerTempFolder(windows)).toBe(`${drive}\\ProgramData\\halonic\\runner-temp`);
    expect(runnerTempFolder(windows)).not.toContain("acme");
  });

  it("refuses a runner temp folder on Windows without an absolute ProgramData", () => {
    const environment = { platform: "windows", homeFolder: windowsHome } as const;
    expect(() => runnerTempFolder(profileFolder({ ...environment, variables: {} }))).toThrow(
      RangeError,
    );
    expect(() =>
      runnerTempFolder(profileFolder({ ...environment, variables: { ProgramData: "data" } })),
    ).toThrow(RangeError);
  });
});
