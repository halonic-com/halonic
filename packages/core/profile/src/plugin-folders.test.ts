import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { pluginRecordsFolder, pluginsFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.profile-folder", () => {
  it("names the plugins and plugin-records folders in the profile folder, joined the profile's way", () => {
    const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;
    expect(pluginsFolder(linux)).toBe("/srv/acme/.local/share/halonic/plugins");
    expect(pluginRecordsFolder(linux)).toBe("/srv/acme/.local/share/halonic/plugin-records");
    const windows = { platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") } as const;
    expect(pluginsFolder(windows)).toBe(drive("<drive>\\Users\\acme\\halonic\\plugins"));
    expect(pluginRecordsFolder(windows)).toBe(
      drive("<drive>\\Users\\acme\\halonic\\plugin-records"),
    );
  });
});
