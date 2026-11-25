import type { AgentMessaging } from "@halonicjs/ports";

/**
 * Where a client's focus report goes: the server's one poll loop reads
 * sources about every 30 seconds while any client is in front, and every
 * 5 minutes otherwise (`server.messaging-rate`). It must not throw.
 */
export interface MessagingFocus {
  report(inFront: boolean): void;
}

/**
 * What the `/api/messaging/*` routes need (`server.messaging-routes`): the
 * engine's `AgentMessaging`, which joins the server's providers, and the poll
 * loop's focus. A host that runs no messaging provider leaves the group out,
 * and the routes then answer 404 like an unknown path. A many-user server
 * never mounts them, because every user would act with the one Paperclip key.
 */
export interface MessagingPorts {
  readonly port: AgentMessaging;
  readonly focus: MessagingFocus;
}
