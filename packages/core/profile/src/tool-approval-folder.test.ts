import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { toolApprovalFolder } from "./profile-folder.ts";

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.tool-approval-folder", () => {
  it("is tool-approvals in the profile folder, joined the profile's way", () => {
    expect(toolApprovalFolder({ platform: "linux", root: "/srv/acme/.local/share/halonic" })).toBe(
      "/srv/acme/.local/share/halonic/tool-approvals",
    );
    expect(
      toolApprovalFolder({ platform: "windows", root: drive("<drive>\\Users\\acme\\halonic") }),
    ).toBe(drive("<drive>\\Users\\acme\\halonic\\tool-approvals"));
  });
});
