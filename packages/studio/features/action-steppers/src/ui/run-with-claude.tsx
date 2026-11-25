import { renderServerSessionLauncher, type ServerTarget } from "@halonicjs/action-steppers";
import { Button, Callout, CommandBox, CopyButton, Disclosure } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { ServerSessionOffer } from "../server-session/server-session-offer.ts";
import type {
  ServerChoice,
  ServerSessionAnswer,
  ServerSessionShell,
} from "../server-session/server-session-shell.ts";
import * as words from "./server-session-words.ts";

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
  return (
    // By hand the user runs the ssh command, never the launcher, so its disclosure stays hidden.
    <ConfirmScreen offer={offer} target={server.target} showLauncher={!manual}>
      <Outcome
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
  readonly children: ReactNode;
}

/**
 * The confirm screen, copied from the review (`request-review.tsx`): where it starts, then the
 * brief word for word. React writes the brief as a text node, so nothing in it is ever Markdown.
 */
function ConfirmScreen({ offer, target, showLauncher, children }: ConfirmScreenProps) {
  const titleId = useId();
  const captionId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const launcher = renderServerSessionLauncher(target, offer.task);
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
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
          className="focus-ring max-h-80 overflow-y-auto rounded-sm bg-surface-subtle p-3 font-mono text-small text-fg whitespace-pre-wrap wrap-anywhere"
        >
          {offer.brief}
        </pre>
      </figure>
      {showLauncher && launcher.ok ? (
        <Disclosure summary={words.showCommands} openSummary={words.hideCommands}>
          <pre className="mx-4 mb-4 rounded-sm bg-surface-subtle p-3 font-mono text-small text-fg whitespace-pre-wrap wrap-anywhere">
            {launcher.value}
          </pre>
        </Disclosure>
      ) : null}
      {children}
    </section>
  );
}

interface OutcomeProps {
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
function Outcome({ phase, offer, target, manual, start, cancel, openSettings }: OutcomeProps) {
  const answer = phase.kind === "answered" ? phase.answer : undefined;
  if (manual) {
    const why = answer?.kind === "no-terminal" ? words.noTerminal : words.cannotOpenTerminal;
    return (
      <div className="flex flex-col gap-2">
        <ManualStart why={why} brief={offer.brief} target={target} />
        <CancelButton cancel={cancel} />
      </div>
    );
  }
  if (answer?.kind === "terminal-opened") {
    return <Callout tone="info">{words.started(offer.task)}</Callout>;
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
        <Button busy={phase.kind === "starting"} onClick={start}>
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
}

/** The manual guide where the shell can't open a terminal: Windows, the browser, or none found. */
function ManualStart({ why, brief, target }: ManualStartProps) {
  return (
    <Callout tone="info" title={words.guideTitle}>
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
