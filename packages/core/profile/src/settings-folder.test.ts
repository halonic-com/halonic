import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import golden from "./golden/profile-folders.json" with { type: "json" };
import { type ProfileEnvironment, profileFolder, settingsFolder } from "./profile-folder.ts";

/** A case of `golden/profile-folders.json` with the settings folder it names; `null` when refused. */
interface GoldenCase {
  readonly name: string;
  readonly platform: ProfileEnvironment["platform"];
  readonly homeFolder: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly settings: string | null;
}

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.settings-folder", () => {
  it("names the settings folder in the profile folder, joined the profile's way", () => {
    const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;
    expect(settingsFolder(linux)).toBe("/srv/acme/.local/share/halonic/settings");
    const windows = { platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") } as const;
    expect(settingsFolder(windows)).toBe(drive("<drive>\\Users\\acme\\halonic\\settings"));
  });

  // The same cases the desktop shell's Rust port checks (`crates/profile/tests/golden.rs`).
  describe("the golden settings folders", () => {
    for (const goldenCase of golden as readonly GoldenCase[]) {
      const { settings } = goldenCase;
      if (settings === null) continue;
      it(goldenCase.name, () => {
        const environment: ProfileEnvironment = {
          platform: goldenCase.platform,
          homeFolder: drive(goldenCase.homeFolder),
          variables: Object.fromEntries(
            Object.entries(goldenCase.variables).map(([name, value]) => [name, drive(value)]),
          ),
        };
        expect(settingsFolder(profileFolder(environment))).toBe(drive(settings));
      });
    }
  });
});
