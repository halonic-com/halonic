import type { Version } from "@halonicjs/studio-feature-source-control/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { versionHistoryOf } from "./version-history.ts";

verifies("runs.run-view.live-or-saved", () => {
  it("says a workspace has versions only when its history has one (HAL-12727)", async () => {
    const version = {} as Version;
    const askedFor: number[] = [];
    const history = (versions: readonly Version[]) =>
      versionHistoryOf({
        readHistory: async (limit) => {
          askedFor.push(limit);
          return versions;
        },
      });
    expect(await history([]).hasVersions()).toBe(false);
    expect(await history([version]).hasVersions()).toBe(true);
    expect(askedFor).toEqual([1, 1]);
  });
});
