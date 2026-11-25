import type { Capability, IssuesClient, RuntimeHost } from "./host.ts";

/**
 * The Paperclip clients one action call may use, cut down to the
 * capabilities its handler declares. The plugin as a whole holds every
 * capability its actions need, so without this cut a read action's code
 * could still reach the comment or update client. A method the action
 * didn't declare throws before anything reaches the host.
 */

/** What an action reaches Paperclip through, in the calling agent's company and run. */
export interface PaperclipAccess {
  readonly companyId: string;
  readonly runId: string;
  readonly issues: Omit<IssuesClient, "setDisposition"> & {
    readonly setDisposition: IssuesClient["setDisposition"] | undefined;
  };
  readonly agents: Pick<RuntimeHost["agents"], "list">;
  /** Reading the runtime's own plugin state, which every plugin holds (`plugin.state.read`). */
  readonly state: Pick<RuntimeHost["state"], "get">;
}

/** Throws unless the action declared `capability`, before anything reaches the host. */
function demand(declared: readonly Capability[], capability: Capability): void {
  if (!declared.includes(capability)) {
    throw new Error(`this action doesn't declare ${capability}, so it may not use it.`);
  }
}

/**
 * The clients for one call of an action that declared `declared`. The host
 * is read only when a method is used, so an action that never touches
 * Paperclip doesn't need its clients. `setDisposition` is there only when
 * the host has it and the action may update tasks.
 *
 * @example
 * const access = paperclipAccess(ctx, ["issues.read"], { companyId, runId });
 * await access.issues.createComment(...); // throws: the action didn't declare issue.comments.create
 */
export function paperclipAccess(
  host: Pick<RuntimeHost, "issues" | "agents"> & {
    readonly state: Pick<RuntimeHost["state"], "get">;
  },
  declared: readonly Capability[],
  call: { readonly companyId: string; readonly runId: string },
): PaperclipAccess {
  const allowed = (capability: Capability) => demand(declared, capability);
  return {
    ...call,
    issues: {
      get: (...args) => {
        allowed("issues.read");
        return host.issues.get(...args);
      },
      listComments: (...args) => {
        allowed("issue.comments.read");
        return host.issues.listComments(...args);
      },
      relations: {
        get: (...args) => {
          allowed("issue.relations.read");
          return host.issues.relations.get(...args);
        },
      },
      documents: {
        list: (...args) => {
          allowed("issue.documents.read");
          return host.issues.documents.list(...args);
        },
        get: (...args) => {
          allowed("issue.documents.read");
          return host.issues.documents.get(...args);
        },
      },
      createComment: (...args) => {
        allowed("issue.comments.create");
        return host.issues.createComment(...args);
      },
      update: (...args) => {
        allowed("issues.update");
        return host.issues.update(...args);
      },
      get setDisposition() {
        const setDisposition = host.issues.setDisposition;
        if (!declared.includes("issues.update") || setDisposition === undefined) {
          return undefined;
        }
        return setDisposition.bind(host.issues);
      },
    },
    agents: {
      list: (...args) => {
        allowed("agents.read");
        return host.agents.list(...args);
      },
    },
    state: { get: (key) => host.state.get(key) },
  };
}
