import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sandboxJournalFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.profile-folder", () => {
  it("is sandbox-journals in the profile folder, joined the profile's way", () => {
    expect(
      sandboxJournalFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" }),
    ).toBe("/srv/acme/.local/share/halonic/sandbox-journals");
    expect(
      sandboxJournalFolder({ platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") }),
    ).toBe(drive("<drive>\\Users\\acme\\halonic\\sandbox-journals"));
  });
});
