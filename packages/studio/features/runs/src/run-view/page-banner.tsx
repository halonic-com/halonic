import type { SandboxStartCheck } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import {
  Callout,
  type CalloutAction,
  COMMAND_COPIED,
  COMMAND_NOT_COPIED,
  inlineLinkClasses,
  type ToastStore,
  useOpenExternal,
  useToastStore,
  useWriteClipboard,
} from "@halonicjs/studio-kit";
import { copyDetailsWords, useCopyDetails } from "@halonicjs/studio-shell";
import type { InstructionTrustHost, SourcedRun } from "../api.ts";
import { failureWords } from "../failure-words.ts";
import { runPageWords } from "../run-words.ts";
import { BlockedFailureBanner, blockedFailure } from "./blocked-banner.tsx";
import { seeTheStepText } from "./blocked-sites.tsx";
import { childFailureBanner, type FailedChildView } from "./child-failure-banner.ts";
import type { StepEntry } from "./every-step-model.ts";
import { agentNameOf, causeBanner } from "./failure-banner.ts";
import { refusedInstructions } from "./instructions-refusal.ts";
import { InstructionsRefusalBanner } from "./instructions-refusal-banner.tsx";
import type { RunAgain } from "./run-again.ts";
import {
  type BannerAction,
  type BannerFix,
  type RunBanner,
  type RunPageContext,
  runBanner,
  withParentRun,
} from "./run-page-model.ts";
import {
  SandboxNotReadyBanner,
  sandboxNotReadyAgent,
  sandboxNotReadyReason,
} from "./sandbox-not-ready-banner.tsx";

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
  runAgain,
  openModels,
  openBudget,
  phone = false,
  onSeeStep,
  failedChild,
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
  /** Run again, the last button of a failed banner that has no button of its own; absent when it can't be done. */
  readonly runAgain?: RunAgain | undefined;
  /**
   * Opens Models, for a failed banner that offers **Open Models**: the alias's tab when one is
   * given and the page can open it, else Models on the workspace page. Absent where it can't.
   */
  readonly openModels?: ((alias?: string) => void) | undefined;
  /** Opens the workspace page at its Budget block, for **Change budget** on a budget banner; absent where it can't. */
  readonly openBudget?: (() => void) | undefined;
  /** Whether the page is a phone's: a fix it can't do is said as a line (microcopy 15.3). */
  readonly phone?: boolean;
  readonly onSeeStep: (entryId: string) => void;
  /** The child run the run's step failed with, whose cause the banner says; absent for any other run. */
  readonly failedChild?: FailedChildView | undefined;
}) {
  const chosen = chooseBanner(run, context, log, entries, {
    asksTrust: instructionTrust !== undefined,
    phone,
    failedChild,
  });
  if (chosen.kind === "refused") {
    // A new key for each refusal, so an answer to an earlier one isn't shown for a later run.
    return (
      <InstructionsRefusalBanner
        key={run.summary.id}
        refusal={chosen.refused}
        host={instructionTrust?.host}
        announce={announce}
      />
    );
  }
  if (chosen.kind === "sandbox") {
    return (
      <SandboxNotReadyBanner
        key={run.summary.id}
        name={sandboxNotReadyName(log, context) ?? context.workflow?.name ?? run.summary.workflowId}
        reason={chosen.reason}
        check={sandboxStartCheck}
        announce={announce}
        phone={phone}
        runAgain={runAgain}
      />
    );
  }
  if (chosen.kind === "blocked") {
    return <BlockedFailureBanner failure={chosen.failure} onSeeStep={onSeeStep} />;
  }
  return (
    <Banner
      banner={chosen.banner}
      reviewInInbox={reviewInInbox}
      openRun={openRun}
      runAgain={runAgain}
      openModels={openModels}
      openBudget={openBudget}
      seeStep={failedStepOpener(entries, onSeeStep)}
    />
  );
}

/** Which of the page's banners a run gets, in the order `PageBanner` tries them. */
type ChosenBanner =
  | {
      readonly kind: "refused";
      readonly refused: NonNullable<ReturnType<typeof refusedInstructions>>;
    }
  | { readonly kind: "sandbox"; readonly reason: string }
  | { readonly kind: "blocked"; readonly failure: NonNullable<ReturnType<typeof blockedFailure>> }
  | { readonly kind: "banner"; readonly banner: RunBanner | undefined; readonly cause: boolean };

/** What decides between the page's banners besides the run, its log and its steps. */
interface BannerChoice {
  readonly asksTrust: boolean;
  readonly phone: boolean;
  readonly failedChild: FailedChildView | undefined;
}

function chooseOwnBanner(
  run: SourcedRun,
  context: RunPageContext,
  log: readonly RunEvent[] | undefined,
  entries: readonly StepEntry[],
  { asksTrust, phone, failedChild }: BannerChoice,
): ChosenBanner {
  const refused =
    log === undefined || !asksTrust ? undefined : refusedInstructions(run.summary, log);
  if (refused !== undefined) return { kind: "refused", refused };
  const reason = sandboxNotReadyReason(run.summary, log);
  if (reason !== undefined) return { kind: "sandbox", reason };
  const cause = causeBanner(run.summary, log, context, phone);
  if (cause !== undefined) return { kind: "banner", banner: cause, cause: true };
  const failure = log === undefined ? undefined : blockedFailure(run.summary, log, entries);
  if (failure !== undefined) return { kind: "blocked", failure };
  const child =
    failedChild === undefined
      ? undefined
      : childFailureBanner(run.summary, context, failedChild, phone);
  if (child !== undefined) return { kind: "banner", banner: child, cause: true };
  return { kind: "banner", banner: runBanner(run, context), cause: false };
}

/** The page's banners, each led back to the run that started this one when it failed (HAL-15864). */
function chooseBanner(
  run: SourcedRun,
  context: RunPageContext,
  log: readonly RunEvent[] | undefined,
  entries: readonly StepEntry[],
  choice: BannerChoice,
): ChosenBanner {
  const chosen = chooseOwnBanner(run, context, log, entries, choice);
  return chosen.kind === "banner"
    ? { ...chosen, banner: withParentRun(run.summary, chosen.banner) }
    : chosen;
}

/**
 * Whether the page's banner offers **Run again**: a failed (danger) banner with no button of its
 * own. The header leaves its Run again out then, so the page has one (HAL-12406, Sofia on HAL-12440).
 */
export function bannerOffersRunAgain(
  run: SourcedRun,
  context: RunPageContext,
  log: readonly RunEvent[] | undefined,
  entries: readonly StepEntry[],
  {
    reviewInInbox,
    openRun,
    ...choice
  }: BannerChoice & {
    readonly reviewInInbox: (() => void) | undefined;
    readonly openRun: ((runId: string) => void) | undefined;
  },
): boolean {
  const chosen = chooseBanner(run, context, log, entries, choice);
  return (
    chosen.kind === "banner" &&
    chosen.banner?.kind === "callout" &&
    chosen.banner.tone === "danger" &&
    bannerAction(chosen.banner.action, reviewInInbox, openRun) === undefined
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
  runAgain,
  openModels,
  openBudget,
  seeStep,
}: {
  readonly banner: RunBanner | undefined;
  readonly reviewInInbox: (() => void) | undefined;
  readonly openRun: ((runId: string) => void) | undefined;
  readonly runAgain: RunAgain | undefined;
  readonly openModels?: ((alias?: string) => void) | undefined;
  readonly openBudget?: (() => void) | undefined;
  /** Opens the failed step's panel, for **See the step**; absent while no step is marked failed. */
  readonly seeStep: (() => void) | undefined;
}) {
  const writeClipboard = useWriteClipboard();
  const toasts = useToastStore();
  const openExternal = useOpenExternal();
  const copyDetails = useCopyDetails();
  if (banner === undefined) {
    return null;
  }
  if (banner.kind === "note") {
    return <CancelledNote note={banner} openRun={openRun} />;
  }
  const own = bannerAction(banner.action, reviewInInbox, openRun);
  const buttonsOf = (list: readonly BannerFix[] | undefined) =>
    (list ?? []).flatMap((fix) =>
      fixAction(
        fix,
        writeClipboard,
        toasts,
        { openModels, openBudget, seeStep, openRun },
        openExternal,
      ),
    );
  const fixes = buttonsOf(banner.fixes);
  const links = buttonsOf(banner.links);
  // The same test as `bannerOffersRunAgain`, which keeps the header's Run again out.
  const again =
    own === undefined &&
    banner.tone === "danger" &&
    banner.noRunAgain !== true &&
    runAgain !== undefined
      ? [{ label: runPageWords.runAgain, onClick: runAgain.start }]
      : [];
  const { details } = banner;
  const copy =
    details === undefined
      ? []
      : [
          { label: copyDetailsWords.label, onClick: () => copyDetails(details) },
          ...buttonsOf(banner.afterDetails),
        ];
  const action = [...(own === undefined ? [] : [own]), ...fixes, ...again, ...links, ...copy];
  return (
    <section aria-label={banner.name}>
      <Callout
        tone={banner.tone}
        {...(banner.title === undefined ? {} : { title: banner.title })}
        {...(action.length === 0 ? {} : { action })}
        // The next Tab after the run's heading lands on the first action, so each is heard with
        // what the banner says (C461 BN1).
        describeActions
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

/** A cancelled run's plain note, and the link to its parent run when the page can open runs. */
function CancelledNote({
  note,
  openRun,
}: {
  readonly note: Extract<RunBanner, { kind: "note" }>;
  readonly openRun: ((runId: string) => void) | undefined;
}) {
  const { parent } = note;
  return (
    <p className="text-body">
      {note.text}
      {parent === undefined || openRun === undefined ? null : (
        <>
          {" "}
          <button type="button" className={inlineLinkClasses} onClick={() => openRun(parent.runId)}>
            {parent.label}
          </button>
        </>
      )}
    </p>
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
    // Braces, so whatever `openRun` returns isn't taken for a promise the button waits on.
    return {
      label: action.label,
      onClick: () => {
        openRun(runId);
      },
    };
  }
  return undefined;
}

/** A fix's button, or nothing when the page can't do it: Models, Budget and another run can't be opened on every page, and a step only once it is marked failed. A page outside Studio opens through the host. */
function fixAction(
  fix: BannerFix,
  writeClipboard: (text: string) => Promise<boolean>,
  toasts: ToastStore | null,
  open: {
    readonly openModels: ((alias?: string) => void) | undefined;
    readonly openBudget: (() => void) | undefined;
    readonly seeStep: (() => void) | undefined;
    readonly openRun: ((runId: string) => void) | undefined;
  },
  openExternal: (address: string) => Promise<void>,
): CalloutAction[] {
  if (fix.kind === "open-run") {
    const own = bannerAction(fix, undefined, open.openRun);
    return own === undefined ? [] : [own];
  }
  if (fix.kind === "open-external") {
    const { address } = fix;
    return [
      {
        label: fix.label,
        opens: fix.opens,
        onClick: () => {
          void openExternal(address);
        },
      },
    ];
  }
  if (fix.kind === "copy-command") {
    const { command } = fix;
    // Confirmed like the CommandBox; the promise keeps the button busy until the copy settles.
    const copy = async () => {
      const copied = await writeClipboard(command);
      toasts?.show({
        tone: copied ? "success" : "warning",
        title: copied ? COMMAND_COPIED : COMMAND_NOT_COPIED,
      });
    };
    return [{ label: failureWords.copyCommand, onClick: copy }];
  }
  if (fix.kind === "change-budget") {
    const openBudget = open.openBudget;
    return openBudget === undefined
      ? []
      : [{ label: runPageWords.changeBudget, onClick: () => openBudget() }];
  }
  if (fix.kind === "see-step") {
    const seeStep = open.seeStep;
    return seeStep === undefined ? [] : [{ label: seeTheStepText(), onClick: () => seeStep() }];
  }
  const openModels = open.openModels;
  if (openModels === undefined) {
    return [];
  }
  const alias = fix.alias;
  return [
    {
      label: fix.label ?? failureWords.openModels,
      onClick: () => {
        openModels(alias);
      },
    },
  ];
}

/** Opens the panel of the step the run failed in, or `undefined` while no step is marked failed. */
function failedStepOpener(
  entries: readonly StepEntry[],
  onSeeStep: (entryId: string) => void,
): (() => void) | undefined {
  const failed = entries.findLast((entry) => entry.mark === "failed");
  return failed === undefined ? undefined : () => onSeeStep(failed.id);
}

/** The agent the sandbox stopped, as its file names it (the log gives its id). */
function sandboxNotReadyName(
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
): string | undefined {
  const agent = sandboxNotReadyAgent(log);
  return agent === undefined ? undefined : agentNameOf(agent, context);
}
