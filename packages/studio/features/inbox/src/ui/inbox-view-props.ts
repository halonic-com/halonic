import type { AgentMessaging, ServiceSignIn } from "@halonicjs/ports";
import type {
  RequesterPolicy,
  StepperCatalog,
} from "@halonicjs/studio-feature-action-steppers/api";
import type { RunsList } from "@halonicjs/studio-feature-runs/api";
import type { ActionSteps, AgentConnections } from "@halonicjs/studio-services";
import type { EngineWords, ItemRef, OpenItemOptions } from "@halonicjs/studio-shell";
import type { Inbox } from "../inbox.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import type { InboxMotion } from "./list-motion.ts";
import type { RunFactsOf } from "./run-facts.ts";
import type { ServerSessionHost } from "./use-action-checks.ts";
import type { TrustReview } from "./workspace-trust.ts";

/** Props for `InboxView`. */
export interface InboxViewProps {
  readonly inbox: Inbox;
  /** In the Inbox's own window: the list on the frame and the item on a framed panel. */
  readonly framed?: boolean | undefined;
  /** The clock for the waiting times; tests pass a fixed one. */
  readonly now?: () => Date;
  /**
   * The engine words for this window's host: said when a load fails with no reason of its own,
   * and over the list when a later load fails (microcopy 10.1). The desktop app's by default.
   */
  readonly words?: EngineWords;
  /** The workflows the Inbox starts as requests; without it there is no request form. */
  readonly requests?: InboxRequests | undefined;
  /** The notices under Needs you; without it there is no Notices section. */
  readonly notices?: InboxNotices | undefined;
  /**
   * Accept and Reject on run proposals, which the app provides only where it lists them; without
   * it Needs you says where proposals show, and a proposal names the command that decides it.
   */
  readonly proposals?: ProposalDecisions | undefined;
  /** Opens New connector, for a secret pasted when no account is there to take it. */
  readonly openNewConnector?: () => void;
  /** Opens Workspace settings at Budget, for **Change budget** on the monthly budget notice and the refused request. */
  readonly openBudget?: (() => void) | undefined;
  /** Opens a run's page, for **Open run** on the toast that says a request started. */
  readonly openRun?: ((hubId: string, runId: string) => void) | undefined;
  /** Opens an item's page, for a setup item's own buttons, such as the first run's **Continue**. */
  readonly openPage?: ((item: ItemRef, options?: OpenItemOptions) => void) | undefined;
  /**
   * The workspace's trust, for a card whose answer was refused because the workspace isn't
   * trusted: **Review**, and the line goes once it is. Without it that line has no button.
   */
  readonly trust?: TrustReview | undefined;
  /**
   * The workflow and starter of a run: the row says the workflow, and the card says what started
   * the run and has **Open run** (with `openRun`). Without it the Inbox says neither.
   */
  readonly runFacts?: RunFactsOf | undefined;
  /**
   * The installed catalog an agent's action request is checked against when it opens. Without it
   * nothing is in the catalog, so every request shows as a card Halonic can't read.
   */
  readonly actionCatalog?: StepperCatalog | undefined;
  /** The user's requester policy. Without it the default holds: only routine requests may run. */
  readonly requesterPolicy?: RequesterPolicy | undefined;
  /** Runs an action request's steps; without it, as in a browser, requests can only be reviewed. */
  readonly actionSteps?: ActionSteps | undefined;
  /** Runs a request's sign-in steps; only the desktop app has it. */
  readonly serviceSignIn?: ServiceSignIn | undefined;
  /** The user's connections: a Paperclip request runs only on one of them. Without it, none does. */
  readonly agentConnections?: AgentConnections | undefined;
  /** What "Run with Claude" starts with; without it no server is set up and only the guide shows. */
  readonly serverSession?: ServerSessionHost | undefined;
  /** The workspace's runs: a phone's request sheet stops waiting when the run it started ends. */
  readonly runs?: RunsList | undefined;
  /** Says a line where a screen reader hears it: "New in Needs you: …" for a sent request's card that didn't open. */
  readonly announce?: ((line: string) => void) | undefined;
  /** The agents' cards and questions, listed after the Inbox's own items; without it there are none. */
  readonly agentMessaging?: AgentMessaging | undefined;
  /** The motions it plays as rows come and go and panes change; tests pass their own. */
  readonly motion?: InboxMotion;
  /** Opens the customer's usage, for **See usage** on a run at a plan limit; without it there's none. */
  readonly seeUsage?: (() => void) | undefined;
}
