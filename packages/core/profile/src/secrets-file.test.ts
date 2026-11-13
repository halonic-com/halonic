import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { secretsFile } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.secrets-file", () => {
  it("is secrets/secrets.json in the profile folder, joined the profile's way", () => {
    expect(secretsFile({ platform: "linux", root: "/srv/acme/.local/share/halonic" })).toBe(
      "/srv/acme/.local/share/halonic/secrets/secrets.json",
    );
    expect(secretsFile({ platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") })).toBe(
      drive("<drive>\\Users\\acme\\halonic\\secrets\\secrets.json"),
    );
  });
});
