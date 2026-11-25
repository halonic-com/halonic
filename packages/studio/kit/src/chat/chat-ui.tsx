import type { OpenUiComponent, OpenUiReadResult } from "@halonicjs/openui-lang";
import { Component, type ReactNode } from "react";
import { Disclosure } from "../disclosure/disclosure.tsx";
import { FileIcon } from "../icons/file-icon.tsx";
import { WarningIcon } from "../icons/warning-icon.tsx";
import { LineFrame } from "../line-frame/line-frame.tsx";
import type { ChatUiSend } from "./chat-ui-controls.tsx";
import { ChatUiPart } from "./chat-ui-parts.tsx";

/** The props of `ChatUi`. */
export interface ChatUiProps {
  /** What the reader gave for the reply's components (`readOpenUi` with `chatLibrary`). */
  readonly result: OpenUiReadResult;
  /** The text the agent sent, shown under "Show what it sent" when it can't be drawn. */
  readonly source: string;
  /** The agent's name: "Support desk sent a chart that couldn't be shown." */
  readonly sender: string;
  /**
   * Sends a button's words or a form's answers as the person's message. Without it, the reply's
   * buttons and its form's send button can't be used.
   */
  readonly onSend?: ChatUiSend;
}

/**
 * The components an agent drew in one reply (cards, tables, a form, buttons), 16px apart, as a
 * step of a `ChatMessage` reply. A reply that can't be drawn (broken, too large, a part of the
 * language Studio leaves out) shows the "couldn't be shown" line with the text it sent, closed.
 * A part that fails while it draws does the same, for this reply only. An image is never drawn
 * or loaded: a line says it was left out.
 *
 * @example
 * <ChatUi result={readOpenUi(text, chatLibrary(["card"]))} source={text} sender="Support desk" />
 */
export function ChatUi(props: ChatUiProps) {
  return (
    <ChatUiBoundary {...props}>
      <ChatUiTree {...props} />
    </ChatUiBoundary>
  );
}

function ChatUiTree({ result, source, sender, onSend }: ChatUiProps) {
  if (result.kind !== "tree" || result.root === null) {
    const missing = result.kind === "tree" && !result.incomplete && result.errors.length > 0;
    return result.kind !== "tree" || missing ? (
      <CouldNotShow sender={sender} source={source} what={droppedName(result)} />
    ) : null;
  }
  const dropped = result.errors.filter((error) => error.code === "unknown-component");
  const images = dropped.filter((error) => error.component === "Image").length;
  const others = dropped.filter((error) => error.component !== "Image");
  return (
    <div className="flex flex-col gap-4" data-chat-ui="">
      {((result.root.props["children"] ?? []) as OpenUiComponent[]).map((part, index) => (
        <ChatUiPart key={index} part={part} onSend={onSend} />
      ))}
      {images === 0 ? null : (
        <LineFrame icon={<FileIcon />} muted>
          Image left out: chat doesn't show images yet.
        </LineFrame>
      )}
      {others.length === 0 ? null : (
        <CouldNotShow sender={sender} source={source} what={withArticle(others[0]?.component)} />
      )}
    </div>
  );
}

/** "a chart" for a `Chart` Studio doesn't know, "something" when the reply doesn't say. */
function droppedName(result: OpenUiReadResult): string {
  if (result.kind !== "tree") return "something";
  const unknown = result.errors.find((error) => error.code === "unknown-component");
  return withArticle(unknown?.component);
}

function withArticle(type: string | undefined): string {
  if (type === undefined || type === "") return "something";
  const name = type.toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name}`;
}

interface CouldNotShowProps {
  readonly sender: string;
  readonly source: string;
  readonly what: string;
}

/** The line for a reply Studio can't draw, with what the agent sent behind a closed disclosure. */
function CouldNotShow({ sender, source, what }: CouldNotShowProps) {
  return (
    <div className="flex flex-col gap-2" data-chat-ui="not-shown">
      <LineFrame icon={<WarningIcon />}>
        {sender} sent {what} that couldn't be shown.
      </LineFrame>
      <Disclosure summary="Show what it sent" openSummary="Hide what it sent">
        <pre className="overflow-auto rounded-sm bg-surface-subtle p-3 font-mono text-code whitespace-pre-wrap text-fg">
          {source}
        </pre>
      </Disclosure>
    </div>
  );
}

interface BoundaryState {
  readonly failed: boolean;
  /** The result that failed: a new one, as a reply streams in, gets drawn again. */
  readonly result: OpenUiReadResult | null;
}

/** Catches a part that fails while it draws, so only its own reply shows the line. */
class ChatUiBoundary extends Component<ChatUiProps & { children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false, result: null };

  static getDerivedStateFromProps(props: ChatUiProps, state: BoundaryState) {
    return props.result === state.result ? null : { failed: false, result: props.result };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    const { sender, source, children } = this.props;
    return this.state.failed ? (
      <CouldNotShow sender={sender} source={source} what="something" />
    ) : (
      children
    );
  }
}
