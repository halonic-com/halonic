import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runnerTempFolder, unfencedRunsFolder } from "./profile-folder.ts";

const linux = { platform: "linux", root: "/srv/acme/.local/share/halonic" } as const;

verifies("profile.profile-folder", () => {
  it("keeps the saved yes and the runners' temp folders in their own folders of the profile", () => {
    expect(unfencedRunsFolder(linux)).toBe("/srv/acme/.local/share/halonic/unfenced-runs");
    expect(runnerTempFolder(linux)).toBe("/srv/acme/.local/share/halonic/runner-temp");
  });
});
