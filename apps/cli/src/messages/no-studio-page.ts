// The page a browser gets at `halonic serve`'s address when the npm package
// has no Studio page (HAL-19285): the line `serve` prints, and nothing else.

import { plainText } from "./phrase.ts";
import { serveMessages } from "./serve.ts";

/** The page: the same sentence `serve` prints, and nothing else. */
export function noStudioPage(): string {
  const sentence = escapeHtml(plainText(serveMessages.studioNotInPackage().phrase));
  return [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>Halonic</title></head>',
    `<body><p>${sentence}</p></body>`,
    "</html>",
    "",
  ].join("\n");
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
