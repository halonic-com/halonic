// A page as the model reads it (`assistant.build.read-docs`), the way the
// Gmail tool reads a mail: as text a person sees, without invisible
// characters, with a warning when the HTML hides text, cut to a limit, and
// inside the untrusted fence.

import { fenceUntrusted } from "@halonicjs/app";
import { hiddenTextWarning, hidesText, htmlToText, withoutHiddenText } from "@halonicjs/std";
import type { PageType } from "./docs-fetch.ts";
import { docsTexts } from "./docs-texts.ts";

/** The most characters of a page the model is shown. */
export const pageLimit = 40_000;

/**
 * The result for a page that was read: what it is, the hidden-text warning when it applies and
 * whether it was cut, then the page's text inside the fence. Only the page's own words are
 * inside the fence; everything Halonic says is outside it.
 */
export function pageText(url: string, type: PageType, body: string): string {
  const text = withoutHiddenText(type === "text/html" ? htmlToText(body) : body);
  const cut = text.length > pageLimit;
  const lines = [
    docsTexts.page(url),
    // Markdown may hold HTML too, so it gets the same check.
    ...(type !== "text/plain" && hidesText(body) ? [hiddenTextWarning("page")] : []),
    ...(cut ? [docsTexts.cut(pageLimit)] : []),
  ];
  return `${lines.join("\n")}\n\n${fenceUntrusted(cut ? text.slice(0, pageLimit) : text)}`;
}
