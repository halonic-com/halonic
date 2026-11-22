import { ExternalLink, inlineLinkClasses, standaloneLinkClasses } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/**
 * The kit's inline link inside a sentence, as a link and as a button, each next to the same
 * sentence with plain words in its place, and links that stand on lines of their own (C606-3).
 * Whether the link stretches its line depends on real line boxes, which only a real browser has.
 */
const before =
  "Writer uses the model alias smrt, which this workspace doesn't have. Pick a model on Writer's page, or ";
const after = " and change it there. The rest of the sentence runs on to a further line.";

/** The words in a link's place: they don't break inside, as a button's words don't. */
function PlainWords({ children }: { readonly children: string }) {
  return <span className="whitespace-nowrap">{children}</span>;
}

function Page() {
  return (
    <main className="flex flex-col gap-6 p-4">
      <p data-sentence="link" className="text-body">
        {before}
        {/* Kept on one line, so the test can aim at the middle of its one box. */}
        <span className="whitespace-nowrap">
          <ExternalLink href="https://example.com/writer">Open Writer</ExternalLink>
        </span>
        {after}
      </p>
      <p data-sentence="link-plain" className="text-body">
        {before}
        <PlainWords>Open Writer ↗</PlainWords>
        {after}
      </p>
      <p data-sentence="button" className="text-body">
        {before}
        <button type="button" className={inlineLinkClasses}>
          Open Writer
        </button>
        {after}
      </p>
      <p data-sentence="button-plain" className="text-body">
        {before}
        <PlainWords>Open Writer</PlainWords>
        {after}
      </p>
      <ul data-list="" className="flex flex-col">
        {["Anthropic", "OpenAI", "Ollama"].map((name) => (
          <li key={name}>
            <button type="button" className={`text-left ${standaloneLinkClasses}`}>
              {name}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The inline link page needs its #root element (inline-link.html).");
}
createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
