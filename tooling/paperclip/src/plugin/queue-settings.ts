/**
 * The queue's settings: merge control's (HAL-17700, HAL-17706) and the
 * fast-track rules' (HAL-15971, HAL-17722, HAL-18007), spread into the
 * manifest's instance settings. Kept beside the manifest so it stays under
 * the file size limit.
 */

/** Merge control's settings. */
export const mergeControlConfigProperties = {
  // Merge control's queue credential (ADR on HAL-17700): its own identity, never a board
  // member's login. Read only by src/plugin/merge-control-job.ts, at each write, in act mode.
  mergeQueueToken: {
    type: "string",
    title: "Merge queue token",
    description:
      "The secret with merge control's queue credential (a GitHub App or fine-grained token the board creates). Used only in act mode, only for the two merge-queue mutations, run reruns and cancels, and a pull request comment on the first repository, all to api.github.com.",
    format: "secret-ref",
  },
  mergeControl: {
    type: "object",
    title: "Merge control",
    properties: {
      mode: {
        type: "string",
        title: "Mode",
        description:
          "off: nothing runs. shadow: it decides each minute and writes nothing, and posts a daily diff with the Merger's actions. act: it carries its actions out (only after the board's yes).",
        enum: ["off", "shadow", "act"],
        default: "off",
      },
      diffTask: {
        type: "string",
        title: "Shadow diff task",
        description:
          "The id of the task the daily shadow diff is posted on (HAL-17700). Empty: the diff is only logged.",
      },
    },
  },
};

/** The fast-track rules' settings. */
export const fastTrackConfigProperties = {
  fastTrackUnblocks: {
    type: "array",
    title: "Fast-track PRs that unblock everyone",
    description:
      "Numbers of fast-track pull requests that unblock the merge queue or CI for everyone, so they jump the queue (HAL-15971 point 3). The fast-track rules only log for now.",
    items: { type: "integer", minimum: 1 },
    default: [],
  },
  fastTrackLabelAdder: {
    type: "string",
    title: "The board's GitHub login",
    description:
      "The board's GitHub account, whose fast-track label counts for a jump on any pull request (HAL-15971, HAL-17722). Empty: only halonic-dev's counts, within the scope below.",
  },
  fastTrackSharedLabelScope: {
    type: "array",
    items: { type: "string" },
    title: "Where halonic-dev's fast-track label counts",
    description:
      "A fast-track label added as halonic-dev counts only here (HAL-16003 scope note): a task identifier such as HAL-17422 lets the pull requests of its child tasks count, and owner/name#123 lets that pull request count. Unset: the board's list of 24 Nov; an empty list: nowhere.",
    default: ["HAL-17422", "halonic-com/halonic#5659", "halonic-com/halonic#5674"],
  },
};
