import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

/**
 * Uploads a repository's social preview image (inventory part 1, row 13).
 * GitHub has no API for it, so the one step is `guided`: the user uploads the
 * image on the repository's settings page, and Halonic can't check it.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "github.upload-social-preview",
  version: 1,
  service: "github",
  title: "Upload a social preview image",
  summary: "Sets the image GitHub shows when the repository is shared.",
  // Reversible, public anyway, and the user picks the image on GitHub's own page.
  risk: "routine",
  parameters: strictParameters({ owner: githubOwner, repo: githubRepo }),
  steps: [
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings",
      instructions: [
        "Under **Social preview**, click **Edit**, then **Upload an image…**.",
        "Choose the image: a PNG, JPG or GIF file under 1 MB, at least 640 × 320 pixels (1280 × 640 looks best).",
        "Check that the new image now shows under **Social preview**.",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-25",
    },
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: (parameters) => [
    `Opens the settings of ${parameters["owner"]}/${parameters["repo"]} on GitHub, where you upload the social preview image by hand. Halonic can't check it.`,
  ],
};
