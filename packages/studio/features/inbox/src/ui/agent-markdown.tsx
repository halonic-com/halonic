import {
  ExternalLink,
  type MarkdownBlock,
  type MarkdownInline,
  readMarkdown,
} from "@halonicjs/studio-kit";
import { useMemo } from "react";

/**
 * An agent's question, which whoever can steer the agent may have written (HAL-17436 finding 3,
 * `inbox.agent-inbox-items`). The kit reads its Markdown into plain data and every string is drawn
 * as React text, so no HTML, script or image ever becomes markup and no image loads. The only links
 * are `http` and `https` ones, through `ExternalLink`, which opens them outside Studio with their
 * host after them; nothing in the text is run as a command.
 */
export function AgentMarkdown({ text }: { readonly text: string }) {
  const blocks = useMemo(() => readMarkdown(text), [text]);
  return (
    <div className="flex min-w-0 flex-col gap-2 text-body text-fg wrap-anywhere">
      {blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  );
}

function Block({ block }: { readonly block: MarkdownBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <p dir="auto" className="whitespace-pre-line text-body-strong">
          <Inlines inlines={block.inlines} />
        </p>
      );
    case "quote":
      return (
        <blockquote
          dir="auto"
          className="whitespace-pre-line border-s-2 border-border bg-surface-subtle px-3 py-2"
        >
          <Inlines inlines={block.inlines} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="whitespace-pre-wrap rounded-sm bg-surface-subtle p-3 font-mono text-code">
          {block.text}
        </pre>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          start={block.ordered ? block.start : undefined}
          className={`ps-5 ${block.ordered ? "list-decimal" : "list-disc"}`}
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
        <strong className="text-body-strong">
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
        <code className="rounded-xs bg-surface-muted px-0.5 font-mono text-code">
          {inline.text}
        </code>
      );
    case "app-link":
      // `readMarkdown` reads these only when asked for `appLinks`, which this screen doesn't.
      return inline.text;
    case "link":
      // The agent writes the link's words, so they can't be trusted to say where it goes: its
      // host follows them, as the URL parser writes it, so a look-alike name shows as `xn--`.
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
