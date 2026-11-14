import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectionSettingsFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.connection-settings-folder", () => {
  it("is connections in the profile folder, joined the profile's way", () => {
    expect(
      connectionSettingsFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" }),
    ).toBe("/srv/acme/.local/share/halonic/connections");
    expect(
      connectionSettingsFolder({
        platform: "windows",
        root: drive("<drive>\\Users\\acme\\halonic"),
      }),
    ).toBe(drive("<drive>\\Users\\acme\\halonic\\connections"));
  });
});
