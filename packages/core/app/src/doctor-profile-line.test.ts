import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { profileLine } from "./doctor-profile-line.ts";
import { doctor } from "./testing/doctor-fixtures.ts";

verifies("app.doctor-profile", () => {
  describe("the Profile line", () => {
    it("fails when a variable put the profile folder in the workspace, naming the variable", async () => {
      const profile = { problem: "profile-in-workspace", movedBy: "XDG_DATA_HOME" } as const;
      const report = await doctor({ profile }).service.check(null);

      expect(report.profile).toEqual({ check: "profile", status: "failed", ...profile });
      expect(report.summary).toEqual({ problems: 1, warnings: 0, needsFixing: true });
    });

    it("fails when the workspace is inside the profile folder, with the profile's path", () => {
      const problem = {
        problem: "workspace-in-profile",
        profile: "~/.local/share/halonic",
      } as const;

      expect(profileLine(problem)).toEqual({ check: "profile", status: "failed", ...problem });
    });

    it("isn't there when the host found nothing, or checks nothing", async () => {
      expect((await doctor({ profile: null }).service.check(null)).profile).toBeUndefined();
      expect((await doctor().service.check(null)).profile).toBeUndefined();
    });
  });
});
