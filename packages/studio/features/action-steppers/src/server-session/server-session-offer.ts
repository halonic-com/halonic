/**
 * Whether an Inbox item offers "Run with Claude" (plan on HAL-17834, section 1), and the brief it
 * would send. Only a stored request at the revision its card pinned, whose single block is a
 * `server-session` block for the item's own task, offers it: a label, a name or a newer revision
 * never does. Every check runs again here, whatever the provider already checked (HAL-17491 7.3).
 */
import {
  buildServerSessionBrief,
  type RequesterPolicy,
  type StepperCatalog,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import type { InboxItem, MessagingSource } from "@halonicjs/ports";
import { policyAllows, requesterName } from "../review/action-item-review.ts";

/** What an item is checked against before it offers "Run with Claude". */
export interface ServerSessionContext {
  readonly catalog: StepperCatalog;
  /** The deciding policy from the user's profile, never from a workspace (HAL-17491 6.5). */
  readonly policy: RequesterPolicy;
  /** The requester's Paperclip, such as `https://paperclip.acme.example`, from the connection record. */
  readonly origin: string;
  /** What people call the item's task, such as `HAL-1234`: its work item's label, or `undefined`. */
  readonly task: string | undefined;
}

/** A server session the item offers: what the confirm screen shows and the shell is given. */
export interface ServerSessionOffer {
  readonly task: string;
  /** The whole brief, word for word, as `buildServerSessionBrief` wrote it. */
  readonly brief: string;
  /** Who asked, as the provider attests it, never as the request says. */
  readonly requester: string;
  /** The pinned revision, which the shell's double-click guard keys on. */
  readonly requestHash: string;
}

/** A revision the shell takes as a request hash: a short token, never text. */
const requestHashPattern = /^[A-Za-z0-9:_-]{1,128}$/;

/**
 * The server session `item` offers, or `undefined` when it offers none: it isn't an open stored
 * request, its source has a newer revision, the request doesn't pass `validateStepperRequest`, its
 * single block isn't a `server-session` block for the item's task, the user's policy doesn't allow
 * an `irreversible` request from its source, or the brief can't be built.
 *
 * @param source - the item's source as `AgentMessaging` lists it; `undefined` when it isn't listed
 *
 * @example
 * const offer = offerServerSession(item, source, { catalog, policy, origin, task: "HAL-1234" });
 * if (offer !== undefined) showRunWithClaude(offer);
 */
export function offerServerSession(
  item: InboxItem,
  source: MessagingSource | undefined,
  context: ServerSessionContext,
): ServerSessionOffer | undefined {
  const stepper = item.stepper;
  if (stepper === undefined || stepper.changed || item.state.kind !== "open") return undefined;
  if (!requestHashPattern.test(stepper.revision)) return undefined;
  const checked = validateStepperRequest(stepper.document, context.catalog);
  if (!checked.ok) return undefined;
  const [block, ...others] = checked.value.request.blocks;
  if (block?.kind !== "server-session" || others.length > 0) return undefined;
  if (context.task === undefined || block.task !== context.task) return undefined;
  if (!policyAllows(item, source, checked.value.risk, context.policy)) return undefined;
  const requester = requesterName(item.from);
  const brief = buildServerSessionBrief(block, requester, context.origin);
  if (!brief.ok) return undefined;
  return { task: block.task, brief: brief.value, requester, requestHash: stepper.revision };
}
