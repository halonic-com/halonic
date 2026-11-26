import type { PluginUi } from "@halonicjs/format";
import {
  ExternalLink,
  type MarkdownBlock,
  type MarkdownInline,
  readMarkdown,
} from "@halonicjs/studio-kit";
import { useMemo } from "react";
import { readTable, type Table } from "../text/table.ts";

/** How a command or card draws its tool's answer. */
export type ResultShow = PluginUi["commands"][number]["show"];

export interface PluginResultProps {
  /** A plugin tool's answer. It is untrusted: never read as HTML. */
  readonly text: string;
  readonly show: ResultShow;
}

/**
 * A plugin tool's answer, as its command or card asks (`plugins.plugin-text`): plain text,
 * sanitised Markdown or a simple table. Every string is React text, so nothing a plugin writes
 * becomes markup, and its only links go through `ExternalLink`. A `table` answer that isn't a
 * table shows as plain text.
 */
export function PluginResult({ text, show }: PluginResultProps) {
  // A long answer is read once, not on every render.
  const table = useMemo(() => (show === "table" ? readTable(text) : null), [text, show]);
  const blocks = useMemo(() => (show === "markdown" ? readMarkdown(text) : null), [text, show]);
  if (table !== null) return <ResultTable table={table} />;
  if (blocks !== null) return <MarkdownBlocks blocks={blocks} />;
  return <bdi className="block whitespace-pre-wrap wrap-anywhere text-body text-fg">{text}</bdi>;
}

function MarkdownBlocks({ blocks }: { readonly blocks: readonly MarkdownBlock[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-body text-fg wrap-anywhere">
      {blocks.map((block, index) => (
        <ResultBlock key={index} block={block} />
      ))}
    </div>
  );
}

function ResultBlock({ block }: { readonly block: MarkdownBlock }) {
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
          className="whitespace-pre-line border-s-2 border-border ps-3 text-fg-muted"
        >
          <Inlines inlines={block.inlines} />
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-auto rounded-sm bg-surface-subtle p-3 font-mono text-code">
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
  return inlines.map((inline, index) => <InlinePart key={index} inline={inline} />);
}

function InlinePart({ inline }: { readonly inline: MarkdownInline }) {
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
      // The plugin writes the link's words, so they can't be trusted to say where it goes: its
      // host shows after it for everyone, keyboard and touch included, and the full address on
      // hover.
      return (
        <span title={inline.href}>
          <ExternalLink href={inline.href}>{inline.text}</ExternalLink>
          <span className="text-fg-muted">
            {" ("}
            <bdi dir="ltr">{hostOf(inline.href)}</bdi>)
          </span>
        </span>
      );
  }
}

/**
 * Where a link goes, in short: its host with any port, as the URL parser writes it, so an
 * international name shows as its `xn--` form and can't pass for a look-alike, and an IP address
 * shows as itself. The Markdown reader only lets `http` and `https` addresses through, and the
 * parser gives those a host every time.
 */
function hostOf(href: string): string {
  return new URL(href).host;
}

function ResultTable({ table }: { readonly table: Table }) {
  return (
    <div className="overflow-auto rounded-sm border border-border">
      <table className="w-full border-collapse text-small text-fg">
        <thead className="bg-surface-subtle text-fg-muted">
          <tr>
            {table.columns.map((column, index) => (
              <th key={index} scope="col" dir="auto" className="px-3 py-1.5 text-start font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-border">
              {row.map((cell, index) => (
                <td key={index} dir="auto" className="px-3 py-1.5 align-top whitespace-pre-wrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
