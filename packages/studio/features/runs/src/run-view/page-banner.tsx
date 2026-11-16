import type { SandboxStartCheck } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { Callout, type CalloutAction } from "@halonicjs/studio-kit";
import type { InstructionTrustHost, SourcedRun } from "../api.ts";
import { runPageWords } from "../run-words.ts";
import { BlockedFailureBanner, blockedFailure } from "./blocked-banner.tsx";
import type { StepEntry } from "./every-step-model.ts";
import { causeBanner } from "./failure-banner.ts";
import { refusedInstructions } from "./instructions-refusal.ts";
import { InstructionsRefusalBanner } from "./instructions-refusal-banner.tsx";
import {
  type BannerAction,
  type RunBanner,
  type RunPageContext,
  runBanner,
} from "./run-page-model.ts";
import { SandboxNotReadyBanner, sandboxNotReadyReason } from "./sandbox-not-ready-banner.tsx";

/** The page's one banner: the failed banner for the run's cause, the sandbox's for a run it stopped, else the usual one. */
export function PageBanner({
  run,
  context,
  log,
  entries,
  reviewInInbox,
  openRun,
  instructionTrust,
  sandboxStartCheck,
  announce,
  phone = false,
  onSeeStep,
}: {
  readonly run: SourcedRun;
  readonly context: RunPageContext;
  readonly log: readonly RunEvent[] | undefined;
  readonly entries: readonly StepEntry[];
  readonly reviewInInbox: (() => void) | undefined;
  readonly openRun: ((runId: string) => void) | undefined;
  /**
   * Where the instructions refusal gets its own banner, with the host that asks (absent on a
   * served page or a phone). Absent on a card, which has no place for the question, so a refused
   * run shows the usual banner there.
   */
  readonly instructionTrust?: { readonly host: InstructionTrustHost | undefined };
  /** Checks the sandbox again, for the banner of a run it refused; absent where nothing can check. */
  readonly sandboxStartCheck?: SandboxStartCheck | undefined;
  /** Says a line to a screen reader, for the answer to a press in a banner. */
  readonly announce?: ((line: string) => void) | undefined;
  /** Whether the page is a phone's: a fix it can't do is said as a line (microcopy 15.3). */
  readonly phone?: boolean;
  readonly onSeeStep: (entryId: string) => void;
}) {
  const refused =
    log === undefined || instructionTrust === undefined
      ? undefined
      : refusedInstructions(run.summary, log);
  if (refused !== undefined) {
    // A new key for each refusal, so an answer to an earlier one isn't shown for a later run.
    return (
      <InstructionsRefusalBanner
        key={run.summary.id}
        refusal={refused}
        host={instructionTrust?.host}
        announce={announce}
      />
    );
  }
  const sandboxReason = sandboxNotReadyReason(run.summary, log);
  if (sandboxReason !== undefined) {
    return (
      <SandboxNotReadyBanner
        key={run.summary.id}
        workflow={context.workflow?.name ?? run.summary.workflowId}
        reason={sandboxReason}
        check={sandboxStartCheck}
        announce={announce}
        phone={phone}
      />
    );
  }
  const cause = causeBanner(run.summary, log, context, phone);
  if (cause !== undefined) {
    return <Banner banner={cause} reviewInInbox={reviewInInbox} openRun={openRun} />;
  }
  const blocked = log === undefined ? undefined : blockedFailure(run.summary, log, entries);
  if (blocked !== undefined) {
    return <BlockedFailureBanner failure={blocked} onSeeStep={onSeeStep} />;
  }
  return (
    <Banner banner={runBanner(run, context)} reviewInInbox={reviewInInbox} openRun={openRun} />
  );
}

/**
 * The one banner: a Callout in a region named by its hidden title, or the
 * cancelled run's plain note. A banner that appears mid-run doesn't take focus.
 */
function Banner({
  banner,
  reviewInInbox,
  openRun,
}: {
  readonly banner: RunBanner | undefined;
  readonly reviewInInbox: (() => void) | undefined;
  readonly openRun: ((runId: string) => void) | undefined;
}) {
  if (banner === undefined) {
    return null;
  }
  if (banner.kind === "note") {
    return <p className="text-body">{banner.text}</p>;
  }
  const action = bannerAction(banner.action, reviewInInbox, openRun);
  return (
    <section aria-label={banner.name}>
      <Callout
        tone={banner.tone}
        {...(banner.title === undefined ? {} : { title: banner.title })}
        {...(action === undefined ? {} : { action })}
      >
        {banner.lines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </Callout>
    </section>
  );
}

/** The banner's button, when the page can do what it asks. */
function bannerAction(
  action: BannerAction | undefined,
  reviewInInbox: (() => void) | undefined,
  openRun: ((runId: string) => void) | undefined,
): CalloutAction | undefined {
  if (action?.kind === "review-in-inbox" && reviewInInbox !== undefined) {
    return { label: runPageWords.reviewInInbox, onClick: reviewInInbox };
  }
  if (action?.kind === "open-run" && openRun !== undefined) {
    const { runId } = action;
    return { label: action.label, onClick: () => openRun(runId) };
  }
  return undefined;
}
