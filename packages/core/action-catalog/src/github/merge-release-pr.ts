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
 * Merges a release pull request directly at the head commit the request
 * names (inventory row 2), as the user, with their own GitHub sign-in (board
 * rule). A merge is a release, so it's `irreversible`. The first check stops
 * it unless the pull request is still open and its head is a branch of the
 * same repository: a fork's author picks its branch name and commit, so a
 * fork's pull request is never a release. The second reads the head commit
 * through GitHub's `pull/{n}/head` ref, because its sha is a top-level field
 * there and a request's `expect` takes no dotted name such as `head.sha`: it
 * stops when the head differs from the request's `expect`, or from the `sha`
 * the merge sends. The merge sends that `sha` too, so GitHub itself refuses it
 * if the head moves between the check and the merge. It always squashes, the
 * way release pull requests merge.
 *
 * The REST merge can't join a merge queue (only GraphQL's
 * `enqueuePullRequest` can), so GitHub refuses it on a branch whose rules
 * require one, unless the user may bypass those rules; then the merge skips
 * the queue and its required checks. The preview says both.
 */
export const definition: StepperDefinition<MergeParameters> = {
  id: "github.merge-release-pr",
  version: 1,
  service: "github",
  title: "Merge a release pull request",
  summary:
    "Merges a release pull request directly on GitHub at the head commit the request names. GitHub refuses it on a branch that requires a merge queue.",
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
      keep: ["state", "merged", "head.ref", "base.ref", "head.user.login", "head.repo.name"],
      requires: [
        {
          name: "state",
          equals: "open",
          reason: "This pull request is no longer open, so there is nothing to merge.",
        },
        {
          name: "head.user.login",
          equalsParameter: "owner",
          reason: "This pull request comes from another repository, so it isn't a release.",
        },
        {
          name: "head.repo.name",
          equalsParameter: "repo",
          reason: "This pull request comes from another repository, so it isn't a release.",
        },
      ],
      manual: {
        url: pullPage,
        instructions: [
          "Check that the pull request says **Open** and that it merges a branch of {owner}/{repo}, not of a fork.",
        ],
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
        instructions: [
          "Check that the newest commit is {sha}, and that release card {release_card} names this commit.",
        ],
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
          "Choose **Squash and merge** on the merge button, click it, then click **Confirm squash and merge**.",
          "If the button says **Merge when ready** instead, the branch merges through a merge queue: click it, then **Confirm merge when ready**. GitHub merges once the queue's checks pass.",
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
  // The confirm dialog shows only the merge's own line, so it repeats the full sha and the card.
  preview: (parameters, current = {}) => {
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const pull = `pull request #${parameters["pull_number"]} of ${repository}`;
    const commit = `\`${parameters["sha"]}\``;
    const cardCheck = `Check that release card \`${parameters["release_card"]}\` names this commit.`;
    return [
      pullSentence(pull, repository, current),
      headSentence(commit, cardCheck, current),
      `Merges ${pull} directly, as one squashed commit, at head commit ${commit} only. ${cardCheck} GitHub refuses the merge if the head moved, and on a branch that requires a merge queue unless you may bypass its rules, which skips the queue's checks. A merge can't be undone.`,
    ];
  },
};

/** The pull request as GitHub answered it, or what the check will read. */
function pullSentence(pull: string, repository: string, current: Kept): string {
  const head = current["head.ref"];
  const base = current["base.ref"];
  if (typeof head !== "string" || typeof base !== "string") {
    return `Reads ${pull} on GitHub. It stops unless the pull request is still open and merges a branch of ${repository}.`;
  }
  return `${capitalised(pull)}: \`${head}\` into \`${base}\`.`;
}

/** The head commit by the sha GitHub answered, never the request's alone. */
function headSentence(commit: string, cardCheck: string, current: Kept): string {
  const head = current["sha"];
  if (typeof head !== "string") {
    return `Reads the pull request's head commit, and stops unless it is ${commit}.`;
  }
  return `Its head commit is \`${head}\`. ${cardCheck}`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
