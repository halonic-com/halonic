import { createContext, useContext, useMemo } from "react";
import { ExternalLink, inlineLinkClasses } from "../external-link/external-link.tsx";
import { type OpenExternal, OpenExternalProvider } from "../external-link/open-external.tsx";
import { type MarkdownBlock, type MarkdownInline, readMarkdown } from "../text/markdown.ts";

/** The props of `ChatText`. */
export interface ChatTextProps {
  /** What the model wrote in one step, as plain text. */
  readonly children: string;
  /**
   * How a link opens, such as the shell's `useOpenExternal()`. Left out, a link is text that
   * opens nothing, which suits a model's reply in a chat. Given, a link is an `ExternalLink` whose
   * click calls this instead of navigating the window (`kit.chat-text-links`).
   */
  readonly openLink?: OpenExternal;
  /**
   * How a link to a task, an approval or an agent in Studio opens, such as `/ACME/issues/ACME-42`.
   * Left out, such a link shows only its words, as text. Given, its words are a link-styled button
   * whose click calls this with the path (`kit.chat-text-app-links`).
   */
  readonly openAppLink?: (path: string) => void;
}

// Set only when the caller gave `openLink` or `openAppLink`; the blocks and inlines in between
// don't need to know.
const OpenLinkContext = createContext<OpenExternal | undefined>(undefined);
const OpenAppLinkContext = createContext<((path: string) => void) | undefined>(undefined);

/**
 * A step of a reply that's text: `text-reading` in `fg`, with the Markdown a reply may use drawn
 * as bold, italic, code, lists and quotes (`kit.chat-message`). Every string is React text, so
 * nothing the model writes becomes markup, and a link shows its address as text that opens
 * nothing unless the caller says how links open. Paragraphs keep the model's line breaks.
 *
 * @example
 * <ChatText>{"I added **morning-sort**. It runs at `0 8 * * 1-5`."}</ChatText>
 * <ChatText openLink={useOpenExternal()}>{"See [the PR](https://example.com/pr/1)."}</ChatText>
 * <ChatText openAppLink={openPage}>{"Done in [ACME-42](/ACME/issues/ACME-42)."}</ChatText>
 */
export function ChatText({ children, openLink, openAppLink }: ChatTextProps) {
  // The text grows while it streams; it's read again only when it changes.
  const blocks = useMemo(() => readMarkdown(children, { appLinks: true }), [children]);
  return (
    <OpenLinkContext value={openLink}>
      <OpenAppLinkContext value={openAppLink}>
        <div className="flex min-w-0 flex-col gap-3 text-reading text-fg wrap-break-word">
          {blocks.map((block, index) => (
            <ReplyBlock key={index} block={block} />
          ))}
        </div>
      </OpenAppLinkContext>
    </OpenLinkContext>
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
    case "app-link":
      return <AppLink path={inline.path} text={inline.text} />;
  }
}

/**
 * A link to a task, an approval or an agent in Studio: only its words, since `readMarkdown` checked
 * the path and opening it stays inside Studio. Like the Studio's other in-app links it's a button
 * in the inline link style, so it never navigates the window.
 */
function AppLink({ path, text }: { readonly path: string; readonly text: string }) {
  const openAppLink = useContext(OpenAppLinkContext);
  if (openAppLink === undefined) return text;
  return (
    <button type="button" className={inlineLinkClasses} onClick={() => openAppLink(path)}>
      {text}
    </button>
  );
}

/**
 * A link: its words, then its full address, since a model's words can say one place and go to
 * another. Without `openLink` nothing here opens and the address can be read and copied on
 * purpose. With it, the words are an `ExternalLink`; `readMarkdown` only makes a link of a web
 * address, so a `javascript:` one never gets here.
 */
function ReplyLink({ href, text }: { readonly href: string; readonly text: string }) {
  const openLink = useContext(OpenLinkContext);
  const address = <bdi dir="ltr">{href}</bdi>;
  // A link whose words are its address shows it once.
  const words = text === href ? address : text;
  const addressAfter =
    text === href ? null : (
      <span className="text-fg-muted">
        {" ("}
        {address})
      </span>
    );
  if (openLink === undefined) {
    return (
      <>
        {words}
        {addressAfter}
      </>
    );
  }
  return (
    <>
      <OpenExternalProvider openExternal={openLink}>
        <ExternalLink href={href}>{words}</ExternalLink>
      </OpenExternalProvider>
      {addressAfter}
    </>
  );
}
