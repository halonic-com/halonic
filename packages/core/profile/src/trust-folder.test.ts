import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import golden from "./golden/profile-folders.json" with { type: "json" };
import { type ProfileEnvironment, profileFolder, trustFolder } from "./profile-folder.ts";

/**
 * One case of `golden/profile-folders.json`, which the desktop shell's Rust
 * port (`apps/studio/src-tauri/crates/profile`) checks too. Drives are
 * written `<drive>`, so the repo's leak guard doesn't read them as a real
 * machine's paths.
 */
type GoldenCase = {
  readonly name: string;
  readonly platform: ProfileEnvironment["platform"];
  readonly homeFolder: string;
  readonly variables: Readonly<Record<string, string>>;
} & (
  | { readonly profile: string; readonly trust: string }
  /** An environment that is refused. */
  | { readonly profile: null; readonly trust: null }
);

const drive = (text: string) => text.replaceAll("<drive>", "D:");

verifies("profile.trust-folder", () => {
  describe("the golden profile folders", () => {
    for (const goldenCase of golden as readonly GoldenCase[]) {
      it(goldenCase.name, () => {
        const environment: ProfileEnvironment = {
          platform: goldenCase.platform,
          homeFolder: drive(goldenCase.homeFolder),
          variables: Object.fromEntries(
            Object.entries(goldenCase.variables).map(([name, value]) => [name, drive(value)]),
          ),
        };
        if (goldenCase.profile === null) {
          expect(() => profileFolder(environment)).toThrow(RangeError);
          return;
        }
        const profile = profileFolder(environment);
        expect(profile.root).toBe(drive(goldenCase.profile));
        expect(trustFolder(profile)).toBe(drive(goldenCase.trust));
      });
    }
  });
});
