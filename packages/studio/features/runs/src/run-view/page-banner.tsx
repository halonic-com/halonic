import type { SandboxStartCheck } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import {
  Callout,
  type CalloutAction,
  COMMAND_COPIED,
  COMMAND_NOT_COPIED,
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
}) {
  const chosen = chooseBanner(run, context, log, entries, instructionTrust !== undefined, phone);
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

function chooseBanner(
  run: SourcedRun,
  context: RunPageContext,
  log: readonly RunEvent[] | undefined,
  entries: readonly StepEntry[],
  asksTrust: boolean,
  phone: boolean,
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
  return { kind: "banner", banner: runBanner(run, context), cause: false };
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
    asksTrust,
    phone,
    reviewInInbox,
    openRun,
  }: {
    readonly asksTrust: boolean;
    readonly phone: boolean;
    readonly reviewInInbox: (() => void) | undefined;
    readonly openRun: ((runId: string) => void) | undefined;
  },
): boolean {
  const chosen = chooseBanner(run, context, log, entries, asksTrust, phone);
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
}: {
  readonly banner: RunBanner | undefined;
  readonly reviewInInbox: (() => void) | undefined;
  readonly openRun: ((runId: string) => void) | undefined;
  readonly runAgain: RunAgain | undefined;
  readonly openModels?: ((alias?: string) => void) | undefined;
  readonly openBudget?: (() => void) | undefined;
}) {
  const writeClipboard = useWriteClipboard();
  const toasts = useToastStore();
  const openExternal = useOpenExternal();
  const copyDetails = useCopyDetails();
  if (banner === undefined) {
    return null;
  }
  if (banner.kind === "note") {
    return <p className="text-body">{banner.text}</p>;
  }
  const own = bannerAction(banner.action, reviewInInbox, openRun);
  const buttonsOf = (list: readonly BannerFix[] | undefined) =>
    (list ?? []).flatMap((fix) =>
      fixAction(fix, writeClipboard, toasts, { openModels, openBudget }, openExternal),
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
      : [{ label: copyDetailsWords.label, onClick: () => copyDetails(details) }];
  const action = [...(own === undefined ? [] : [own]), ...fixes, ...again, ...links, ...copy];
  return (
    <section aria-label={banner.name}>
      <Callout
        tone={banner.tone}
        {...(banner.title === undefined ? {} : { title: banner.title })}
        {...(action.length === 0 ? {} : { action })}
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

/** A fix's button, or nothing when the page can't do it: Models and Budget can't be opened on every page. A page outside Studio opens through the host. */
function fixAction(
  fix: BannerFix,
  writeClipboard: (text: string) => Promise<boolean>,
  toasts: ToastStore | null,
  open: {
    readonly openModels: ((alias?: string) => void) | undefined;
    readonly openBudget: (() => void) | undefined;
  },
  openExternal: (address: string) => Promise<void>,
): CalloutAction[] {
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

/** The agent the sandbox stopped, as its file names it (the log gives its id). */
function sandboxNotReadyName(
  log: readonly RunEvent[] | undefined,
  context: RunPageContext,
): string | undefined {
  const agent = sandboxNotReadyAgent(log);
  return agent === undefined ? undefined : agentNameOf(agent, context);
}
