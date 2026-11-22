import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import golden from "./golden/profile-places.json" with { type: "json" };
import type { ProfileEnvironment } from "./profile-folder.ts";
import {
  builtInProfileFolder,
  type ProfileMover,
  profileMover,
  profileRefusal,
} from "./profile-placement.ts";

/**
 * The cases in `golden/profile-places.json`, which the desktop shell's Rust
 * port (`apps/studio/src-tauri/crates/profile`) checks too. Drives are
 * written `<drive>`, so the repo's leak guard doesn't read them as a real
 * machine's paths.
 */
type GoldenEnvironment = {
  readonly name: string;
  readonly platform: ProfileEnvironment["platform"];
  readonly homeFolder: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly builtIn: string;
  readonly movedBy: ProfileMover | null;
};

type GoldenPlaces = {
  readonly name: string;
  readonly platform: ProfileEnvironment["platform"];
  readonly workspace: string;
  readonly profile: string;
  readonly builtIn: string;
  readonly movedBy: ProfileMover | null;
  readonly refusal: "profile-in-workspace" | "workspace-in-profile" | null;
};

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.profile-outside-workspace", () => {
  describe("the built-in profile and what moved it", () => {
    for (const goldenCase of golden.environments as readonly GoldenEnvironment[]) {
      it(goldenCase.name, () => {
        const variables = Object.fromEntries(
          Object.entries(goldenCase.variables).map(([name, value]) => [name, drive(value)]),
        );
        const environment: ProfileEnvironment = {
          platform: goldenCase.platform,
          homeFolder: drive(goldenCase.homeFolder),
          variables,
        };
        expect(builtInProfileFolder(environment).root).toBe(drive(goldenCase.builtIn));
        expect(profileMover(environment)).toBe(goldenCase.movedBy);
      });
    }
  });

  describe("where the profile may be", () => {
    for (const goldenCase of golden.places as readonly GoldenPlaces[]) {
      it(goldenCase.name, () => {
        const refusal = profileRefusal({
          platform: goldenCase.platform,
          workspace: drive(goldenCase.workspace),
          profile: drive(goldenCase.profile),
          builtIn: drive(goldenCase.builtIn),
          movedBy: goldenCase.movedBy,
        });
        expect(refusal?.code ?? null).toBe(goldenCase.refusal);
        if (refusal?.code === "profile-in-workspace") {
          expect(refusal.movedBy).toBe(goldenCase.movedBy);
        }
      });
    }
  });
});
