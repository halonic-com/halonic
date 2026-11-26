import type { MessagingId } from "@halonicjs/ports";
import {
  Avatar,
  ChevronDownIcon,
  EmptyState,
  enter,
  isComposing,
  leave,
} from "@halonicjs/studio-kit";
import {
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { AskWindow } from "../api.ts";
import type { AskSession } from "../ask-session.ts";
import { quickAskWords } from "../quick-ask-words.ts";
import { AgentPicker, type PickerExit } from "./agent-picker.tsx";
import { BoxFooter, type FooterAnswer } from "./box-footer.tsx";
import { ExchangeList } from "./exchange-list.tsx";
import { answerText } from "./exchange-view.tsx";
import { OpeningView } from "./opening-view.tsx";
import { type AskBoxModel, type Exchange, useAskBox } from "./use-ask-box.ts";

/** The props of {@link AskBox}. */
export interface AskBoxProps {
  readonly session: AskSession;
  readonly window: AskWindow;
  /** Called once the box has faded out on Esc or a click beside it. */
  readonly onClosed: () => void;
}

/**
 * The 640 px box, 16 px corners and the dialogs' shadow; in dark it lifts by its strong border and
 * a 1 px white line along its top edge. On a screen narrower than the box and its 32 px margin, the
 * margin is 16 px. It never grows past its window, so a long answer scrolls the exchanges instead of
 * pushing the footer out of sight (HAL-19213).
 */
const boxClasses = [
  "flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-lg bg-surface-raised text-fg shadow-3",
  "border border-[light-dark(var(--color-border),var(--color-border-strong))]",
  "inset-shadow-[0_1px_0_light-dark(transparent,rgb(255_255_255/0.06))]",
].join(" ");

/** The agent chip: a 32 px pill with the agent's picture, its name and a chevron (design section 4). */
const agentChipClasses = [
  "order-first flex h-8 max-w-48 shrink-0 items-center gap-1.5 rounded-full border border-border",
  "py-0.5 ps-0.5 pe-2 text-body text-fg hover:bg-surface-muted focus-ring",
].join(" ");

/** **Ask**: quiet on the muted tile while the box is empty, primary once there's text, as Messenger's Send. */
function askClasses(hasText: boolean): string {
  const look = hasText
    ? "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover"
    : "bg-surface-muted text-fg";
  return `grid size-control-md shrink-0 place-items-center rounded-sm border border-transparent focus-ring ${look}`;
}

/**
 * Quick ask's box (requirement `quick-ask.box`, design HAL-18594 sections 4–6): a `dialog`
 * labelled "Ask an agent" with the picked agent, the text box and **Ask**, the questions asked and
 * their answers below, and one footer: the keys, or **Copy** and **Open in Messenger** once there's
 * an answer. It fades in and rises 8 px as it opens; Esc or a click beside it fades it out and hides
 * the window, and opening a chat in Messenger fades it out as Messenger's window opens.
 */
export function AskBox({ session, window, onClosed }: AskBoxProps) {
  const model = useAskBox(session);
  const box = useRef<HTMLElement>(null);
  const closing = useRef(false);

  useEffect(() => {
    if (box.current !== null) void enter(box.current);
  }, []);

  if (model.state.kind === "failed") throw model.state.error;

  /** Fades the box out once, then has its window hide or open a chat. */
  const fadeOut = async (then: () => Promise<void>, failure: string) => {
    if (closing.current) return;
    closing.current = true;
    if (box.current !== null) await leave(box.current);
    then().catch((error: unknown) => {
      console.error(failure, error);
    });
    onClosed();
  };
  const close = () => fadeOut(() => window.hide(), "Quick ask couldn't hide its window:");
  const openChat = (conversation: MessagingId) =>
    void fadeOut(
      () => window.openChat(conversation),
      "Quick ask couldn't open the chat in Messenger:",
    );
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || isComposing(event)) return;
    event.preventDefault();
    void close();
  };
  const onBeside = (event: MouseEvent) => {
    if (event.target === event.currentTarget) void close();
  };

  return (
    // A click beside the box closes it, as Esc does from the keyboard.
    // biome-ignore lint/a11y/noStaticElementInteractions: the see-through margin round the box, not a control.
    <div className="flex h-dvh flex-col items-center p-8 max-[703px]:p-4" onMouseDown={onBeside}>
      <section
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={quickAskWords.label}
        className={boxClasses}
        onKeyDown={onKeyDown}
      >
        {model.state.kind === "opening" ? <OpeningView /> : null}
        {model.state.kind === "no-agents" ? <NoAgents window={window} /> : null}
        {model.state.kind === "ready" ? <Ready model={model} onOpenChat={openChat} /> : null}
      </section>
    </div>
  );
}

function NoAgents({ window }: { readonly window: AskWindow }) {
  const openStudio = () =>
    window.openStudio().catch((error: unknown) => {
      console.error("Quick ask couldn't bring Studio's window forward:", error);
    });
  return (
    <div className="p-6">
      <EmptyState
        title={quickAskWords.noAgents}
        description={quickAskWords.noAgentsHint}
        action={{ label: quickAskWords.openStudio, onClick: () => void openStudio() }}
      />
    </div>
  );
}

function Ready({
  model,
  onOpenChat,
}: {
  readonly model: AskBoxModel;
  readonly onOpenChat: (conversation: MessagingId) => void;
}) {
  const [picking, setPicking] = useState(false);
  const text = useRef<HTMLTextAreaElement>(null);
  const ask = useRef<HTMLButtonElement>(null);
  const hintId = useId();
  if (model.state.kind !== "ready") return null;
  const { agent, agents, exchanges, lastAnswer } = model.state;
  const name = agent.agent.name;
  const answer = newestAnswer(exchanges.at(-1));

  const closePicker = (exit: PickerExit) => {
    setPicking(false);
    focus(exit === "forward" ? ask : text);
  };
  const onTextKey = textKeys(model, () => setPicking(true));
  const placeholder =
    answer === undefined ? quickAskWords.placeholder(name) : quickAskWords.reply(name);

  return (
    <>
      <QuestionRow
        name={name}
        placeholder={placeholder}
        model={model}
        picking={picking}
        onKeyDown={onTextKey}
        onAgent={() => setPicking((open) => !open)}
        text={text}
        ask={ask}
        keysId={answer === undefined ? hintId : undefined}
      />
      {picking ? (
        <AgentPicker
          agents={agents}
          picked={agent}
          onPick={(chosen) => {
            model.pick(chosen);
            closePicker("back");
          }}
          onClose={closePicker}
        />
      ) : null}
      {exchanges.length > 0 ? (
        <ExchangeList exchanges={exchanges} onRetry={model.retry} onOpenChat={onOpenChat} />
      ) : null}
      <BoxFooter
        answer={answer}
        hintId={hintId}
        lastAnswer={lastAnswer}
        onOpenChat={onOpenChat}
        onOpenLastAnswer={(opened) => {
          model.forgetLastAnswer();
          onOpenChat(opened.conversation);
        }}
      />
    </>
  );
}

/** The props of {@link QuestionRow}. */
interface QuestionRowProps {
  readonly name: string;
  readonly placeholder: string;
  readonly model: AskBoxModel;
  readonly picking: boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  readonly onAgent: () => void;
  readonly text: RefObject<HTMLTextAreaElement | null>;
  readonly ask: RefObject<HTMLButtonElement | null>;
  /** The hint row's id while it shows, so the text box says its keys; none once Copy replaces it. */
  readonly keysId: string | undefined;
}

/**
 * The box's top row: the text box first, so the focus starts there, then the picked agent's
 * chip, drawn before it, and **Ask** with its drawn arrow.
 */
function QuestionRow({
  name,
  placeholder,
  model,
  picking,
  onKeyDown,
  onAgent,
  text,
  ask,
  keysId,
}: QuestionRowProps) {
  const value = model.state.kind === "ready" ? model.state.text : "";
  return (
    <div className="flex shrink-0 items-start gap-2 px-3.5 py-3">
      <textarea
        ref={text}
        // biome-ignore lint/a11y/noAutofocus: the box opens to type a question, and the focus starts here.
        autoFocus
        rows={1}
        aria-label={placeholder}
        aria-describedby={keysId}
        placeholder={placeholder}
        value={value}
        onChange={(event) => model.type(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-control-md flex-1 resize-none bg-transparent py-1.5 text-heading font-normal text-fg outline-none [field-sizing:content] placeholder:text-fg-subtle"
      />
      <button
        type="button"
        aria-label={quickAskWords.agentButton(name)}
        aria-haspopup="listbox"
        aria-expanded={picking}
        onClick={onAgent}
        className={agentChipClasses}
      >
        <Avatar name={name} />
        <span className="truncate">{name}</span>
        <span className="size-3.5 shrink-0 text-fg-muted">
          <ChevronDownIcon />
        </span>
      </button>
      <button
        ref={ask}
        type="button"
        aria-label={quickAskWords.ask}
        aria-keyshortcuts="Enter"
        onClick={() => model.send()}
        className={askClasses(value.trim() !== "")}
      >
        <ArrowUp />
      </button>
    </div>
  );
}

/** The newest exchange's answer and its chat, once the agent has answered. */
function newestAnswer(last: Exchange | undefined): FooterAnswer | undefined {
  if (last?.status !== "sent") return undefined;
  const text = answerText(last.answer);
  return text === undefined ? undefined : { text, conversation: last.agent.row.conversation.id };
}

/** The send button's drawn 16 px arrow, which doesn't change with the system font. */
function ArrowUp() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none">
      <path
        d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The text box's keys: Enter sends, Tab opens the picker, and Shift keeps them for a new line or going back. */
function textKeys(model: AskBoxModel, openPicker: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposing(event) || event.shiftKey) return;
    if (event.key === "Enter") model.send();
    else if (event.key === "Tab") openPicker();
    else return;
    event.preventDefault();
  };
}

/** Moves the focus once the picker has gone, so it lands on the box's own controls. */
function focus(target: RefObject<HTMLElement | null>): void {
  queueMicrotask(() => target.current?.focus());
}
