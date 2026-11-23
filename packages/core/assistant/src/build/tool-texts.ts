// What the Build chat's tools tell the model (flow-assistant 3.1 and 3.7,
// AI changes 1.11). The model reads these as tool results; the chat's tool
// line shows them in its details.

/** The end of every result for a change written as a change to review (flow-assistant 3.1). */
const toReview =
  "The person reviews the change and accepts or rejects it; until then it's marked as yours to review.";

/** The texts of the Build chat's tool results. */
export const toolTexts = {
  /** `propose_file` wrote the file (flow-assistant 3.1). */
  changed: (path: string) => `Changed ${path}. ${toReview}`,
  /** `propose_delete` moved the file to the trash. */
  deleted: (path: string) => `Deleted ${path}. ${toReview}`,
  /** The file isn't what the model last read in this chat (flow-assistant 3.1, HAL-3247). */
  changedSinceRead: "The file changed since you read it. Read it again, then make your change.",
  /** The model never read a file that exists in this chat. */
  readFirst: (path: string) => `Read ${path} first, then make your change.`,
  /** The file changed outside Halonic while it has changes to review, and waits for Compare (AI changes 1.10). */
  held: (path: string) =>
    `${path} changed outside Halonic and waits for the person to compare it. Change it again once they have.`,
  /** A write refused while the workspace is untrusted (`app.assistant-untrusted-items-only`). */
  untrustedWrite: "Not trusted yet: only Halonic items can be changed.",
  /** A read or a listing refused while the workspace is untrusted. */
  untrustedRead: "Not trusted yet: only Halonic items can be read.",
  /** A path the assistant may never write (flow-assistant 3.1). */
  cantWrite: (path: string) => `Couldn't change ${path}: it can't be written to.`,
  /** A path the assistant may never read: `.git/`, `.halonic/`, a private or credential file, or a link. */
  cantRead: (path: string) => `Couldn't read ${path}: it can't be read.`,
  /** No file at the path (`assistant.build.proposals-change-nothing`). */
  doesNotExist: (path: string) => `Error: ${path} does not exist`,
  /** `list_files` found nothing the model may read. */
  noFiles: "No files.",
  /** `list_files` stopped at its limit. */
  moreFiles: (more: number) => `… and ${more} more. Pass "under" to list one folder.`,
  /** `validate` found nothing to fix (`assistant.build.validate-with-proposals`). */
  noProblems: "No problems.",
  /** `schema` was asked for a kind that doesn't exist. */
  unknownKind: (kind: string, kinds: readonly string[]) =>
    `Error: there is no kind "${kind}". The kinds are: ${kinds.join(", ")}.`,
} as const;
