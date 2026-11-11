import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { settingsFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.settings-folder", () => {
  it("names the settings folder in the profile folder, joined the profile's way", () => {
    const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;
    expect(settingsFolder(linux)).toBe("/srv/acme/.local/share/halonic/settings");
    const windows = { platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") } as const;
    expect(settingsFolder(windows)).toBe(drive("<drive>\\Users\\acme\\halonic\\settings"));
  });
});
