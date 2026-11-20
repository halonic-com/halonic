import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { tokenFolders } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.token-folders", () => {
  it("names the token folders in a Linux profile folder", () => {
    expect(tokenFolders({ platform: "linux", root: "/srv/acme/.local/share/halonic" })).toEqual({
      google: "/srv/acme/.local/share/halonic/google/tokens",
      integrationSignIns: "/srv/acme/.local/share/halonic/integration-sign-ins/tokens",
    });
  });

  it("joins them with \\ in a Windows profile folder", () => {
    expect(
      tokenFolders({ platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") }),
    ).toEqual({
      google: drive("<drive>\\Users\\acme\\halonic\\google\\tokens"),
      integrationSignIns: drive("<drive>\\Users\\acme\\halonic\\integration-sign-ins\\tokens"),
    });
  });
});
