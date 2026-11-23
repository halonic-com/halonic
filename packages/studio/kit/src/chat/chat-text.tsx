import { useMemo } from "react";
import { type MarkdownBlock, type MarkdownInline, readMarkdown } from "../text/markdown.ts";

/** The props of `ChatText`. */
export interface ChatTextProps {
  /** What the model wrote in one step, as plain text. */
  readonly children: string;
}

/**
 * A step of a reply that's text: `text-reading` in `fg`, with the Markdown a reply may use drawn
 * as bold, italic, code, lists and quotes (`kit.chat-message`). Every string is React text, so
 * nothing the model writes becomes markup, and a link shows its address as text that opens
 * nothing. Paragraphs keep the model's line breaks.
 *
 * @example
 * <ChatText>{"I added **morning-sort**. It runs at `0 8 * * 1-5`."}</ChatText>
 */
export function ChatText({ children }: ChatTextProps) {
  // The text grows while it streams; it's read again only when it changes.
  const blocks = useMemo(() => readMarkdown(children), [children]);
  return (
    <div className="flex min-w-0 flex-col gap-3 text-reading text-fg wrap-break-word">
      {blocks.map((block, index) => (
        <ReplyBlock key={index} block={block} />
      ))}
    </div>
  );
}

function ReplyBlock({ block }: { readonly block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading":
      // A bold line, not a heading: each reply already has its own hidden one.
      return (
        <p dir="auto" className="whitespace-pre-line font-semibold">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "quote":
      return (
        <blockquote
          dir="auto"
          className="whitespace-pre-line border-s-2 border-border ps-3 text-fg-muted"
        >
          <Inlines inlines={block.inlines} />
        </blockquote>
      );
    case "code":
      // It wraps rather than scrolls, so a narrow panel gets no second scroll or keyboard stop.
      return (
        <pre className="whitespace-pre-wrap wrap-anywhere rounded-sm border border-border bg-surface-subtle px-3 py-2 font-mono text-code">
          {block.text}
        </pre>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          start={block.ordered ? block.start : undefined}
          className={`flex flex-col gap-1 ps-6 marker:text-fg-muted ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item, index) => (
            <li key={index} dir="auto" className="whitespace-pre-line">
              <Inlines inlines={item} />
            </li>
          ))}
        </List>
      );
    }
    case "paragraph":
      return (
        <p dir="auto" className="whitespace-pre-line">
          <Inlines inlines={block.inlines} />
        </p>
      );
  }
}

function Inlines({ inlines }: { readonly inlines: readonly MarkdownInline[] }) {
  return inlines.map((inline, index) => <ReplyInline key={index} inline={inline} />);
}

function ReplyInline({ inline }: { readonly inline: MarkdownInline }) {
  switch (inline.kind) {
    case "text":
      return inline.text;
    case "strong":
      return (
        <strong className="font-semibold">
          <Inlines inlines={inline.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines inlines={inline.children} />
        </em>
      );
    case "code":
      // The transparent border keeps an edge when high contrast drops the fill.
      return (
        <code className="box-decoration-clone rounded-xs border border-transparent bg-surface-muted px-1 font-mono text-code">
          {inline.text}
        </code>
      );
    case "link":
      return <ReplyLink href={inline.href} text={inline.text} />;
  }
}

/**
 * A link as text: its words, then its full address. A model's words can say one place and go to
 * another, so nothing here opens; the address can be read and copied on purpose.
 */
function ReplyLink({ href, text }: { readonly href: string; readonly text: string }) {
  const address = <bdi dir="ltr">{href}</bdi>;
  if (text === href) return address;
  return (
    <>
      {text}
      <span className="text-fg-muted">
        {" ("}
        {address})
      </span>
    </>
  );
}
