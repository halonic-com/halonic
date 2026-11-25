/**
 * An invented server-session request for "Run with Claude": task `HAL-1234` on the `acme`
 * organisation's Paperclip, a server `ops@build.acme.example`. Never a real workspace or server.
 */
import { type RequesterPolicy, stepperRequestFormat } from "@halonicjs/action-steppers";
import { type InboxItem, inboxStepperFormat } from "@halonicjs/ports";
import type { ServerSessionContext } from "../server-session/server-session-offer.ts";
import { acmeCatalog, acmeSource } from "./acme-catalog.test-helper.ts";

/** The block an agent files: restart the acme web service on the user's server. */
export const restartBlock = {
  kind: "server-session",
  task: "HAL-1234",
  steps: ["Restart the acme-web service", "Check its log for errors"],
  doneWhen: "https://acme.example/health answers 200",
} as const;

/** A request document holding `blocks`. */
export function requestDocument(blocks: readonly unknown[] = [restartBlock]): string {
  return JSON.stringify({
    format: stepperRequestFormat,
    title: "Restart acme-web",
    reason: "The site hangs since this morning.",
    blocks,
  });
}

/** An open item from Chief on "Paperclip · Acme" pinning revision `rev-2` of `document`. */
export function serverSessionItem(
  document: string = requestDocument(),
  overrides: Partial<InboxItem> = {},
): InboxItem {
  return {
    id: "item-7",
    source: acmeSource.id,
    from: { kind: "agent", agent: "agent-chief", name: "Chief" },
    question: "Please restart acme-web on our server.",
    options: [],
    stepper: {
      format: inboxStepperFormat,
      document,
      revision: "rev-2",
      touches: [],
      changed: false,
    },
    attachments: [],
    work: "task:HAL-1234",
    createdAt: "2026-11-25T09:00:00.000Z",
    state: { kind: "open" },
    ...overrides,
  };
}

/** Allows "Paperclip · Acme", the source the provider attests, to ask for irreversible requests. */
export const allowsAcme: RequesterPolicy = {
  allowed: [{ source: { kind: "paperclip", id: acmeSource.id } }],
};

/** What the item is checked against: the acme catalog and Paperclip, on task `HAL-1234`. */
export const acmeServerContext: ServerSessionContext = {
  catalog: acmeCatalog,
  policy: allowsAcme,
  origin: "https://paperclip.acme.example",
  task: "HAL-1234",
};
