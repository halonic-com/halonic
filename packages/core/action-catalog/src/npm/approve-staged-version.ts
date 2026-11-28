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
 * The last part of the ref the version was built from, as its provenance
 * names it: `v1.4.0` for `refs/tags/v1.4.0`, or `main` for `refs/heads/main`.
 * A parameter can't hold a `/`, so the instruction checks the ref's end.
 */
const refName = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ } as const;

/**
 * Approves a version a release workflow staged with `npm stage publish`
 * (inventory row 2), so it goes public. npm asks the maintainer's second
 * factor for it, so only the user can do it on npmjs.com: the stepper opens
 * the account's **Staged Packages** tab and the user checks the provenance
 * before approving (release review: the release owner checks commit and ref).
 * The second guided step opens the version's own page, which exists only once
 * the version is public. A registry check through the shell waits for an npm
 * origin in the shell's service list, a security change of its own, so
 * Halonic can't check it yet and the preview says so. The instructions follow
 * npm's documentation (https://docs.npmjs.com/staged-publishing); nobody has
 * walked them on the live pages yet, so `checkedOn` says `from docs`.
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
    ref_name: refName,
  }),
  steps: [
    {
      kind: "guided",
      address: "https://www.npmjs.com/settings/~/staged-packages",
      instructions: [
        "Sign in to npm with an account that maintains @{scope}/{package}, if npm asks you to.",
        "If the page doesn't show your staged packages, open your account's **Settings** and click **Staged Packages**.",
        "Find @{scope}/{package} version {version}. If it isn't listed, stop: the release workflow didn't stage it, or someone already approved or rejected it.",
        "Open its provenance and check that it was built from commit {commit}, on a ref that ends in {ref_name}. If either differs, click **Reject** instead and stop.",
        "Click **Approve**, then confirm with your second factor (2FA).",
      ],
      checkedOn: "from docs",
    },
    {
      kind: "guided",
      address: "https://www.npmjs.com/package/@{scope}/{package}/v/{version}",
      instructions: [
        "Check that the page shows version {version}. A version npm hasn't made public yet has no page, so reload after a minute if it says it's not found.",
      ],
      checkedOn: "from docs",
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
    const built = `commit \`${parameters["commit"]}\` on a ref that ends in \`${parameters["ref_name"]}\``;
    return [
      `Opens your staged packages on npm, where you check that ${version} was built from ${built} and approve it with your second factor. This makes the version public and can't be undone. Halonic can't check it.`,
      `Opens the page of ${version} on npm, where you check that it's public. Halonic can't check it.`,
    ];
  },
};
