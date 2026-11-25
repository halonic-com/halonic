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
  /** `show` showed the item (flow-assistant 3.8 and 5.7). */
  shown: (item: { kind: string; id: string }) =>
    `Showed ${item.kind} ${item.id} in the main view, next to the chat.`,
  /** `show` was asked for an item that isn't there, or one from another workspace's hub. */
  noItem: (item: { kind: string; hub: string; id: string }) =>
    `Error: there is no ${item.kind} "${item.id}" in hub ${item.hub}.`,
  /** `show` in a chat with nowhere to show items, such as on a phone. */
  nowhereToShow: "Error: there's nowhere to show items in this chat.",
  /** A sheet or connector asks for hosts the person didn't name (`assistant.build.named-hosts-secrets`). */
  hostsNotNamed: (path: string, hosts: readonly string[]) =>
    `Couldn't change ${path}: ${hosts.join(", ")} ${hosts.length === 1 ? "isn't a host" : "aren't hosts"} the person named in this chat. Only use hosts from their own messages, exactly as named; ask them for the host, or use { fromSetting } so they fill it in.`,
  /** A sheet asks for more new secrets than the sign-ins the person named. */
  secretsNotNamed: (path: string, secrets: number, named: number) =>
    `Couldn't change ${path}: it adds ${secrets} ${secrets === 1 ? "secret" : "secrets"}, but the person named ${named === 0 ? "no sign-in" : `only ${named} ${named === 1 ? "sign-in" : "sign-ins"}`} (an API key or a token) in this chat. Ask them how they sign in, and add at most one secret for each.`,
  /** A sheet asks for more secrets in all than it had and than the sign-ins the person named. */
  tooManySecrets: (path: string, secrets: number, named: number) =>
    `Couldn't change ${path}: it asks for ${secrets} secrets in all, but the person named ${named === 0 ? "no sign-in" : `only ${named} ${named === 1 ? "sign-in" : "sign-ins"}`} (an API key or a token) in this chat. Ask them how they sign in, and keep at most one secret for each.`,
  /** A sheet adds an OAuth sign-in, which the person can't name in the Build chat. */
  oauthNotNamed: (path: string) =>
    `Couldn't change ${path}: the Build chat can't add an OAuth sign-in (signIns). Use an API key or a token the person names, or tell them the service needs a sign-in Halonic doesn't build here.`,
  /** A sheet or connector that doesn't parse, so what it asks for can't be checked. */
  doesNotParse: (path: string, problem: string) =>
    `Couldn't change ${path}: it isn't valid (${problem}). Fix it, then propose it again.`,
  /** A sheet or connector with a URL whose host can't be read without doubt. */
  unreadableUrl: (path: string) =>
    `Couldn't change ${path}: one of its URLs has a host that can't be read plainly. Write each URL as https://host/path, without spaces, a user name or encoded characters.`,
  /** `schema` was asked for a kind that doesn't exist. */
  unknownKind: (kind: string, kinds: readonly string[]) =>
    `Error: there is no kind "${kind}". The kinds are: ${kinds.join(", ")}.`,
  /** `integration_guide` was asked for a section the guide doesn't have. */
  unknownGuideSection: (section: string, sections: readonly string[]) =>
    `Error: the integration guide has no section "${section}". The sections are: ${sections.map((name) => `"${name}"`).join(", ")}.`,
} as const;
