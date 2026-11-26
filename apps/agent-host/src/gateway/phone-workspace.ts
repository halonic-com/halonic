import type { PhoneMessaging } from "@halonicjs/ports";
import type { WorkspaceMessaging } from "../messaging/workspace-messaging.ts";
import { phoneMessaging } from "./phone-messaging.ts";

/** Finds the workspace whose messaging a paired phone reads now; `undefined` when there is none. */
export type PhoneWorkspacePick = () => Promise<WorkspaceMessaging | undefined>;

/**
 * The {@link phoneMessaging} view of the workspace `pick` finds, looked up
 * again on every call (`agent-host.phone-workspace`): Studio may open another
 * workspace, and a workspace's team hub is replaced when its connections or
 * engine change. A followed `changes` stays on the workspace it started on
 * until the phone follows again.
 */
export function phoneWorkspaceMessaging(pick: PhoneWorkspacePick): PhoneMessaging {
  const view = async (): Promise<PhoneMessaging> => {
    const workspace = await pick();
    if (workspace === undefined) throw new Error("No workspace's messaging is open for the phone");
    return phoneMessaging(workspace.messaging, workspace.team);
  };
  return {
    listSources: async () => (await view()).listSources(),
    listAgents: async () => (await view()).listAgents(),
    listConversations: async () => (await view()).listConversations(),
    listMessages: async (conversation) => (await view()).listMessages(conversation),
    listInboxItems: async () => (await view()).listInboxItems(),
    listWork: async () => (await view()).listWork(),
    search: async (text) => (await view()).search(text),
    answer: async (item, answer) => (await view()).answer(item, answer),
    send: async (conversation, body, attachments, options) =>
      (await view()).send(conversation, body, attachments, options),
    changes: async function* () {
      yield* (await view()).changes();
    },
    team: {
      parts: async () => (await view()).team.parts(),
      spend: async (range) => (await view()).team.spend(range),
      seats: async () => (await view()).team.seats(),
      pullRequests: async () => (await view()).team.pullRequests(),
      pullRequest: async (id) => (await view()).team.pullRequest(id),
      mergeQueue: async () => (await view()).team.mergeQueue(),
      changes: async function* () {
        yield* (await view()).team.changes();
      },
    },
  };
}
