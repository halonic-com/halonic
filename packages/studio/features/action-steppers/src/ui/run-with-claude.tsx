import { renderServerSessionLauncher, type ServerTarget } from "@halonicjs/action-steppers";
import {
  Button,
  Callout,
  type CalloutHandle,
  CommandBox,
  CopyButton,
  Disclosure,
} from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from "react";
import type { ServerSessionOffer } from "../server-session/server-session-offer.ts";
import type {
  ServerChoice,
  ServerSessionAnswer,
  ServerSessionShell,
} from "../server-session/server-session-shell.ts";
import * as words from "./server-session-words.ts";
import { focusLost } from "./stepper-changes.ts";

/** Props for {@link RunWithClaude}. */
export interface RunWithClaudeProps {
  readonly offer: ServerSessionOffer;
  readonly server: ServerChoice;
  /** The shell that opens a terminal, or `undefined` where none can: the manual guide shows instead. */
  readonly shell: ServerSessionShell | undefined;
  readonly openSettings: () => void;
  /** Called once the terminal opened, so the item can be answered. */
  readonly onStarted?: (() => void) | undefined;
}

/** Where the confirm screen stands: open, waiting for the shell, or with the shell's answer. */
type Phase =
  | { readonly kind: "closed" }
  | { readonly kind: "confirm" }
  | { readonly kind: "starting" }
  | { readonly kind: "answered"; readonly answer: ServerSessionAnswer };

/** The answers after which the user starts it by hand. */
const guideAnswers: readonly ServerSessionAnswer["kind"][] = [
  "no-terminal",
  "unsupported-platform",
];

/** What the screen says about the shell's answer, polite or as an alert, or nothing. */
interface Said {
  readonly text: string;
  readonly alert: boolean;
}

/**
 * The words the status region says for `answer`: the same words the screen shows for it. Nothing
 * for an opened terminal: focus moves to the started line, which reads them, so saying them here
 * too would read them twice.
 */
function saidFor(answer: ServerSessionAnswer): Said {
  switch (answer.kind) {
    case "terminal-opened":
      return { text: "", alert: false };
    case "cancelled":
      return { text: words.cancelledInShell, alert: false };
    case "refused":
      return { text: words.shellRefused(answer.reason), alert: true };
    case "no-terminal":
      return { text: words.noTerminal, alert: false };
    case "unsupported-platform":
      return { text: words.cannotOpenTerminal, alert: false };
    case "not-configured":
      return { text: "", alert: false };
  }
}

/** Where focus goes once an answer came: the started line, the guide's title or the heading. */
interface FocusTargets {
  readonly started: RefObject<CalloutHandle | null>;
  readonly guideTitle: RefObject<HTMLSpanElement | null>;
  readonly heading: RefObject<HTMLHeadingElement | null>;
}

/**
 * Follows the shell's answers (`action-steppers.run-with-claude`): when an answer takes away the
 * pressed **Run with Claude**, focus moves to the started line or the manual guide's title, or the
 * confirm heading when neither is there. Returns how many answers came, so the status region reads
 * the same words again on a second try.
 */
function useFollowAnswer(phase: Phase, targets: FocusTargets): number {
  const [answers, setAnswers] = useState(0);
  useEffect(() => {
    if (phase.kind !== "answered") return;
    setAnswers((count) => count + 1);
    if (!focusLost()) return;
    const result = targets.started.current ?? targets.guideTitle.current;
    if (result !== null) result.focus();
    else targets.heading.current?.focus({ preventScroll: true });
  }, [phase, targets]);
  return answers;
}

/**
 * "Run with Claude" for an item that offers a server session (`action-steppers.run-with-claude`):
 * the button, then the confirm screen with the whole brief as plain text under who wrote it. With
 * no server set, the button opens Settings instead. Where the shell can't open a terminal, the
 * screen shows the manual guide with **Copy command**.
 */
export function RunWithClaude({
  offer,
  server,
  shell,
  openSettings,
  onStarted,
}: RunWithClaudeProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "closed" });
  const runButton = useRef<HTMLButtonElement>(null);
  // Cancel removes the focused element with the screen, so focus goes back to the button it came from.
  const focusRunButton = useRef(false);
  useEffect(() => {
    if (phase.kind !== "closed" || !focusRunButton.current) return;
    focusRunButton.current = false;
    runButton.current?.focus();
  }, [phase]);
  const started = useRef<CalloutHandle>(null);
  const guideTitle = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // One object for every render, so following the answers runs only when the phase changes.
  const [targets] = useState<FocusTargets>(() => ({ started, guideTitle, heading }));
  const answers = useFollowAnswer(phase, targets);
  if (server.kind !== "set") {
    return (
      <div className="flex flex-col gap-2">
        {server.kind === "refused" ? (
          <p className="text-body text-fg">{words.serverRefused(server.reason)}</p>
        ) : null}
        <div>
          <Button variant="secondary" onClick={openSettings}>
            {server.kind === "refused" ? words.fixInSettings : words.setUpFirst}
          </Button>
        </div>
      </div>
    );
  }
  if (phase.kind === "closed") {
    return (
      <div>
        <Button ref={runButton} onClick={() => setPhase({ kind: "confirm" })}>
          {words.runWithClaude}
        </Button>
      </div>
    );
  }

  async function start() {
    if (shell === undefined) return;
    setPhase({ kind: "starting" });
    let answer: ServerSessionAnswer;
    try {
      answer = await shell.open(offer);
    } catch {
      answer = { kind: "refused", reason: words.desktopAppFailed };
    }
    setPhase({ kind: "answered", answer });
    if (answer.kind === "terminal-opened") onStarted?.();
  }

  const answer = phase.kind === "answered" ? phase.answer : undefined;
  const manual =
    shell === undefined || (answer !== undefined && guideAnswers.includes(answer.kind));
  const said = answer === undefined ? { text: "", alert: false } : saidFor(answer);
  return (
    // By hand the user runs the ssh command, never the launcher, so its disclosure stays hidden.
    <ConfirmScreen
      offer={offer}
      target={server.target}
      showLauncher={!manual}
      heading={heading}
      said={said}
      answers={answers}
    >
      <Outcome
        targets={targets}
        phase={phase}
        offer={offer}
        target={server.target}
        manual={manual}
        start={start}
        cancel={() => {
          focusRunButton.current = true;
          setPhase({ kind: "closed" });
        }}
        openSettings={openSettings}
      />
    </ConfirmScreen>
  );
}

interface ConfirmScreenProps {
  readonly offer: ServerSessionOffer;
  readonly target: ServerTarget;
  readonly showLauncher: boolean;
  readonly heading: RefObject<HTMLHeadingElement | null>;
  /** What the shell's newest answer says, for the status region or, for a refusal, the alert. */
  readonly said: Said;
  /** How many answers came, so the same words are read again. */
  readonly answers: number;
  readonly children: ReactNode;
}

/**
 * The confirm screen, copied from the review (`request-review.tsx`): where it starts, then the
 * brief word for word. React writes the brief as a text node, so nothing in it is ever Markdown.
 * Each answer is said through a status region, or an alert for a refusal, that is there from the
 * start, because a region that appears already holding its words is often not read.
 */
function ConfirmScreen({
  offer,
  target,
  showLauncher,
  heading,
  said,
  answers,
  children,
}: ConfirmScreenProps) {
  const titleId = useId();
  const captionId = useId();
  useEffect(() => heading.current?.focus({ preventScroll: true }), [heading]);
  const launcher = renderServerSessionLauncher(target, offer.task);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <p role="status" aria-atomic="true" className="sr-only">
        {/* A new key for each answer, so the same words are read again. */}
        <span key={answers}>{said.alert ? "" : said.text}</span>
      </p>
      <p role="alert" aria-atomic="true" className="sr-only">
        <span key={answers}>{said.alert ? said.text : ""}</span>
      </p>
      <h3 id={titleId} ref={heading} tabIndex={-1} className="focus-ring text-body-strong text-fg">
        {words.confirmHeading(target.host)}
      </h3>
      <p className="text-body text-fg wrap-break-word">
        {words.confirmLine.before}
        <code className="font-mono">{`${target.user}@${target.host}`}</code>
        {words.confirmLine.after}
      </p>
      <figure className="flex flex-col gap-1">
        <figcaption id={captionId} className="text-small text-fg-muted">
          {words.writtenBy(offer.requester)}
        </figcaption>
        {/* biome-ignore lint/a11y/useSemanticElements: the `pre` keeps the brief's spaces and line breaks; a `section` around it would add a second box to scroll and focus */}
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area must take focus to scroll by keyboard, which WebKit doesn't do otherwise
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
          className="focus-ring max-h-80 overflow-y-auto rounded-sm border border-border bg-surface-subtle p-3 font-mono text-small text-fg whitespace-pre-wrap wrap-anywhere"
        >
          {offer.brief}
        </pre>
      </figure>
      {showLauncher && launcher.ok ? (
        <Disclosure summary={words.showCommands} openSummary={words.hideCommands}>
          <pre className="mx-4 mb-4 rounded-sm border border-border bg-surface-subtle p-3 font-mono text-small text-fg whitespace-pre-wrap wrap-anywhere">
            {launcher.value}
          </pre>
        </Disclosure>
      ) : null}
      {children}
    </section>
  );
}

interface OutcomeProps {
  readonly targets: FocusTargets;
  readonly phase: Phase;
  readonly offer: ServerSessionOffer;
  readonly target: ServerTarget;
  /** Whether the user starts it by hand: no shell, or the shell can't open a terminal. */
  readonly manual: boolean;
  readonly start: () => Promise<void>;
  readonly cancel: () => void;
  readonly openSettings: () => void;
}

/** Under the brief: the buttons, or what the shell answered. */
function Outcome({
  targets,
  phase,
  offer,
  target,
  manual,
  start,
  cancel,
  openSettings,
}: OutcomeProps) {
  const answer = phase.kind === "answered" ? phase.answer : undefined;
  if (manual) {
    const why = answer?.kind === "no-terminal" ? words.noTerminal : words.cannotOpenTerminal;
    return (
      <div className="flex flex-col gap-2">
        <ManualStart why={why} brief={offer.brief} target={target} title={targets.guideTitle} />
        <CancelButton cancel={cancel} />
      </div>
    );
  }
  if (answer?.kind === "terminal-opened") {
    return (
      <Callout tone="info" announce="focus" ref={targets.started}>
        {words.started(offer.task)}
      </Callout>
    );
  }
  if (answer?.kind === "not-configured") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={openSettings}>
          {words.setUpFirst}
        </Button>
        <CancelButton cancel={cancel} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {answer?.kind === "cancelled" ? (
        <p className="text-body text-fg">{words.cancelledInShell}</p>
      ) : null}
      {answer?.kind === "refused" ? (
        <Callout tone="attention">{words.shellRefused(answer.reason)}</Callout>
      ) : null}
      <p className="text-small text-fg-muted">{words.askedAgain}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" busy={phase.kind === "starting"} onClick={start}>
          {words.runWithClaude}
        </Button>
        <CancelButton cancel={cancel} />
      </div>
    </div>
  );
}

/** The ghost **Cancel** that closes the confirm screen, under every answer that leaves it open. */
function CancelButton({ cancel }: { readonly cancel: () => void }) {
  return (
    <div>
      <Button variant="ghost" onClick={cancel}>
        {words.cancel}
      </Button>
    </div>
  );
}

/** The ssh command the manual guide copies: only the checked server, never the brief. */
function sshCommand(target: ServerTarget): string {
  const port = target.port === undefined ? "" : `-p ${target.port} `;
  return `ssh ${port}-- ${target.user}@${target.host}`;
}

interface ManualStartProps {
  readonly why: string;
  readonly brief: string;
  readonly target: ServerTarget;
  /** The title, which takes focus when the guide replaces the pressed **Run with Claude**. */
  readonly title: RefObject<HTMLSpanElement | null>;
}

/** The manual guide where the shell can't open a terminal: Windows, the browser, or none found. */
function ManualStart({ why, brief, target, title }: ManualStartProps) {
  const heading = (
    <span ref={title} tabIndex={-1} className="focus-ring">
      {words.guideTitle}
    </span>
  );
  return (
    <Callout tone="info" title={heading}>
      <div className="flex flex-col gap-2">
        <p>{why}</p>
        <ol className="list-decimal pl-5">
          <li>
            <div className="flex flex-col gap-2">
              {words.guideSteps.connect}
              <CommandBox command={sshCommand(target)} />
            </div>
          </li>
          <li className="mt-2">
            {words.guideSteps.claude.before}
            <code className="font-mono">claude</code>
            {words.guideSteps.claude.after}
          </li>
          <li className="mt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span>{words.guideSteps.paste}</span>
              <CopyButton text={brief} label={words.copyBrief} />
            </div>
          </li>
        </ol>
      </div>
    </Callout>
  );
}
