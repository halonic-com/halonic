import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubId } from "../github-environment-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";
import { commitSha, releaseCard } from "../github-release-parameters.ts";

type MergeParameters = Record<string, string | number>;
// What the checks kept, as the stepper hands it to the preview.
type Kept = NonNullable<Parameters<StepperDefinition["preview"]>[1]>;

const pullPath = "/repos/{owner}/{repo}/pulls/{pull_number}";

// GitHub's own page for the pull request; its merge button does the same merge.
const pullPage = "https://github.com/{owner}/{repo}/pull/{pull_number}";

/**
 * Merges a release pull request at the head the release card approved
 * (inventory row 2), as the user, with their own GitHub sign-in (board rule).
 * A merge is a release, so it's `irreversible`. The first check stops it
 * unless the pull request is still open. The second reads the pull request's
 * head commit through GitHub's `pull/{n}/head` ref, because its sha is a
 * top-level field there and a request's `expect` takes no dotted name such as
 * `head.sha`: it stops when the head differs from the request's `expect`, or
 * from the `sha` the merge sends. The merge sends that `sha` too, so GitHub
 * itself refuses it if the head moves between the check and the merge. It
 * always squashes, the way release pull requests merge.
 */
export const definition: StepperDefinition<MergeParameters> = {
  id: "github.merge-release-pr",
  version: 1,
  service: "github",
  title: "Merge a release pull request",
  summary: "Merges a release pull request on GitHub at the head commit its release card approved.",
  // Merging a release pull request releases it, which no later step can take back.
  risk: "irreversible",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    pull_number: githubId,
    sha: commitSha,
    release_card: releaseCard,
  }),
  steps: [
    {
      kind: "check",
      path: pullPath,
      keep: ["state", "merged", "head.ref", "base.ref"],
      requires: [
        {
          name: "state",
          equals: "open",
          reason: "This pull request is no longer open, so there is nothing to merge.",
        },
      ],
      manual: {
        url: pullPage,
        instructions: ["Check that the pull request says **Open**."],
      },
    },
    {
      kind: "check",
      path: "/repos/{owner}/{repo}/commits/pull/{pull_number}/head",
      keep: ["sha"],
      requires: [
        {
          name: "sha",
          equalsParameter: "sha",
          reason: "The pull request's head commit isn't the one this request merges.",
        },
      ],
      requiredExpect: ["sha"],
      manual: {
        url: `${pullPage}/commits`,
        instructions: ["Check that the newest commit is {sha}."],
      },
    },
    {
      kind: "call",
      method: "PUT",
      path: `${pullPath}/merge`,
      body: [
        { name: "sha", kind: "parameter" },
        // A constant: a choice's pattern needs a `|`, which the shell's pattern subset has none of.
        { name: "merge_method", kind: "constant", value: "squash" },
      ],
      keep: ["merged", "sha"],
      // The name the user types in the shell's native dialog before the merge is sent.
      target: "{owner}/{repo} pull {pull_number}",
      manual: {
        url: pullPage,
        instructions: [
          "Choose **Squash and merge** on the merge button, then click it.",
          "Click **Confirm squash and merge**.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "pull request",
      name: `${parameters["owner"]}/${parameters["repo"]} pull ${parameters["pull_number"]}`,
    },
  ],
  preview: (parameters, current = {}) => {
    const pull = `pull request #${parameters["pull_number"]} of ${parameters["owner"]}/${parameters["repo"]}`;
    const commit = `\`${String(parameters["sha"]).slice(0, 7)}\``;
    const card = `release card \`${parameters["release_card"]}\``;
    return [
      pullSentence(pull, current),
      headSentence(commit, card, current),
      `Merges ${pull} as one squashed commit, at commit ${commit} only, as ${card} approved; GitHub refuses the merge if the head moved. A merge can't be undone.`,
    ];
  },
};

/** The pull request as GitHub answered it, or what the check will read. */
function pullSentence(pull: string, current: Kept): string {
  const head = current["head.ref"];
  const base = current["base.ref"];
  if (typeof head !== "string" || typeof base !== "string") {
    return `Reads ${pull} on GitHub. It stops unless the pull request is still open.`;
  }
  return `${capitalised(pull)}: \`${head}\` into \`${base}\`.`;
}

/** The head commit by the sha GitHub answered, never the request's alone. */
function headSentence(commit: string, card: string, current: Kept): string {
  const head = current["sha"];
  if (typeof head !== "string") {
    return `Reads the pull request's head commit, and stops unless it is ${commit}, the commit ${card} approved.`;
  }
  return `Its head commit is \`${head.slice(0, 7)}\`, the commit ${card} approved.`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
