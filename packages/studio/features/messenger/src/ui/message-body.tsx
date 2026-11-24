import {
  ExternalLink,
  type MarkdownBlock,
  type MarkdownInline,
  readMarkdown,
} from "@halonicjs/studio-kit";
import { useMemo } from "react";

/** The props of {@link MessageBody}. */
export interface MessageBodyProps {
  /** The message's Markdown, written by an agent or the person. */
  readonly children: string;
}

/**
 * A message's text. An agent writes it, so whoever can steer that agent does
 * (ADR 2026-11-24, agent-written content): the kit's Markdown reader keeps
 * HTML, images and any link that isn't `http` or `https` as plain characters,
 * and every string here is React text, so nothing in a message becomes markup
 * or runs. A web link opens in the browser, outside the app, with its host
 * after it, since its words may name another place. No image ever loads.
 *
 * @example
 * <MessageBody>{"Done: **3 tickets** merged. See [the PR](https://example.com/pr/1)."}</MessageBody>
 */
export function MessageBody({ children }: MessageBodyProps) {
  const blocks = useMemo(() => readMarkdown(children), [children]);
  return (
    <div className="flex min-w-0 flex-col gap-3 text-reading text-fg wrap-break-word">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { readonly block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading":
      // A bold line: a message can't add to the page's outline.
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
          className={`flex flex-col gap-1 ps-6 ${block.ordered ? "list-decimal" : "list-disc"}`}
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
  return inlines.map((inline, index) => <Inline key={index} inline={inline} />);
}

function Inline({ inline }: { readonly inline: MarkdownInline }) {
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
      return (
        <code className="rounded-xs bg-surface-muted px-1 font-mono text-code">{inline.text}</code>
      );
    case "link":
      return (
        <span title={inline.href}>
          <ExternalLink href={inline.href}>{inline.text}</ExternalLink>
          <span className="text-fg-muted">
            {" ("}
            <bdi dir="ltr">{new URL(inline.href).host}</bdi>)
          </span>
        </span>
      );
  }
}
