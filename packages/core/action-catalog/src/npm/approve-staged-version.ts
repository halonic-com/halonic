import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { commitSha } from "../github-release-parameters.ts";
import { npmPackage, npmScope } from "../npm-parameters.ts";

/**
 * A version number, such as `1.4.0` or `1.4.0-rc.1`. The shell's pattern
 * subset has no groups, so the pre-release part is any run of the characters
 * it may hold; no build metadata, since `+` isn't safe in the page's address.
 */
const npmVersion = {
  kind: "text",
  pattern: /^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}[0-9A-Za-z.-]{0,64}$/,
} as const;

/**
 * Approves a version a release workflow staged with `npm stage publish`
 * (inventory row 2), so it goes public. npm asks the maintainer's second
 * factor for it, so only the user can do it on npmjs.com: the stepper opens
 * the account's **Staged Packages** tab and the user checks the provenance
 * before approving (release review: the release owner checks commit and ref).
 * The second guided step opens the version's own page, which exists only once
 * the version is public. A registry check through the shell waits for an npm
 * origin in the shell's service list, a security change of its own, so
 * Halonic can't check it yet and the preview says so.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "npm.approve-staged-version",
  version: 1,
  service: "npm",
  title: "Approve a staged npm version",
  summary:
    "Opens your staged npm packages, where you check and approve one version so it goes public.",
  // It makes a version public for everyone who installs the package; npm never lets a version number be used again.
  risk: "irreversible",
  parameters: strictParameters({
    scope: npmScope,
    package: npmPackage,
    version: npmVersion,
    commit: commitSha,
  }),
  steps: [
    {
      kind: "guided",
      address: "https://www.npmjs.com/settings/~/staged-packages",
      instructions: [
        "Sign in to npm with an account that maintains @{scope}/{package}, if npm asks you to.",
        "If the page doesn't show your staged packages, open your account's **Settings** and click **Staged Packages**.",
        "Find @{scope}/{package} version {version}. If it isn't listed, stop: the release workflow didn't stage it, or someone already approved or rejected it.",
        "Open its provenance and check that it was built from commit {commit}. If it names another commit, click **Reject** instead and stop.",
        "Click **Approve**, then confirm with your second factor (2FA).",
        "Instructions follow npm's documentation: https://docs.npmjs.com/staged-publishing",
      ],
      // From npm's public documentation; the live smoke test walks it.
      checkedOn: "2026-11-28",
    },
    {
      kind: "guided",
      address: "https://www.npmjs.com/package/@{scope}/{package}/v/{version}",
      instructions: [
        "Check that the page shows version {version}. A version npm hasn't made public yet has no page, so reload after a minute if it says it's not found.",
      ],
      checkedOn: "2026-11-28",
    },
  ],
  targets: (parameters) => [
    {
      service: "npm",
      kind: "package version",
      name: `@${parameters["scope"]}/${parameters["package"]}@${parameters["version"]}`,
    },
  ],
  preview: (parameters) => {
    const version = `@${parameters["scope"]}/${parameters["package"]} ${parameters["version"]}`;
    const commit = String(parameters["commit"]).slice(0, 7);
    return [
      `Opens your staged packages on npm, where you check that ${version} was built from commit ${commit} and approve it with your second factor. This makes the version public and can't be undone. Halonic can't check it.`,
      `Opens the page of ${version} on npm, where you check that it's public. Halonic can't check it.`,
    ];
  },
};
