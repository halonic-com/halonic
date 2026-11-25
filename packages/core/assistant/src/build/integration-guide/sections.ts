// The pinned integration guide, cut into its top-level sections, so the
// Build chat reads one at a time instead of the whole guide in every prompt.

import { integrationGuideText } from "./guide.generated.ts";

/**
 * One top-level section of the guide: its heading's text and its Markdown, heading included,
 * exactly as in the guide, so the sections joined with line breaks are the whole guide.
 */
export interface GuideSection {
  readonly name: string;
  readonly text: string;
}

/** The name of the text before the first top-level heading: the guide's title and opening. */
export const introductionName = "Introduction";

/**
 * Cuts a Markdown guide at each `## ` heading. A `##` inside a fenced code block, such as a
 * comment in an example file, doesn't start a section.
 *
 * @example
 * guideSections("# Guide\nHi.\n## 1. Start\nGo.\n").map((section) => section.name);
 * // ["Introduction", "1. Start"]
 */
export function guideSections(guide: string): readonly GuideSection[] {
  const sections: { name: string; lines: string[] }[] = [{ name: introductionName, lines: [] }];
  let inFence = false;
  for (const line of guide.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    if (!inFence && line.startsWith("## ")) {
      sections.push({ name: line.slice(3).trim(), lines: [] });
    }
    sections.at(-1)?.lines.push(line);
  }
  return sections.map(({ name, lines }) => ({ name, text: lines.join("\n") }));
}

/** The sections of the pinned guide, in the guide's order. */
export const integrationGuideSections: readonly GuideSection[] =
  guideSections(integrationGuideText);

/** The section with this name, ignoring case and spaces around it; `undefined` for none. */
export function integrationGuideSection(name: string): GuideSection | undefined {
  const wanted = name.trim().toLowerCase();
  return integrationGuideSections.find((section) => section.name.toLowerCase() === wanted);
}
