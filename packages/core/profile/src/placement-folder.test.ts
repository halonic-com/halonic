import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { placementFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.placement-folder", () => {
  it("is placements in the profile folder, joined the profile's way", () => {
    expect(placementFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" })).toBe(
      "/srv/acme/.local/share/halonic/placements",
    );
    expect(
      placementFolder({ platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") }),
    ).toBe(drive("<drive>\\Users\\acme\\halonic\\placements"));
  });
});
