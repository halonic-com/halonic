/** The Settings sections that have an icon, named like the sections' ids. */
export const sectionIconNames = [
  "models",
  "trust",
  "appearance",
  "formats",
  "assistant",
  "agent-sandbox",
  "trusted-sources",
  "about",
] as const;

/** One of {@link sectionIconNames}. */
export type SectionIconName = (typeof sectionIconNames)[number];

/** The outline of each section's icon, on the place icons' 24 grid. */
const drawings: Readonly<Record<SectionIconName, string>> = {
  // Three layers, as a model's stack of aliases.
  models: "M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
  // A shield with a tick.
  trust: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6zM9 12l2.2 2.2L15 10",
  // A circle with one half drawn solid, as light and dark.
  appearance: "M12 4a8 8 0 110 16 8 8 0 010-16zM12 4v16M12 4a8 8 0 010 16z",
  // A number sign, for number and date formats.
  formats: "M9.5 4l-2 16M16.5 4l-2 16M5 9h15M4 15h15",
  // A speech bubble with its tail.
  assistant: "M5 5h14v10h-7l-4 4v-4H5z",
  // A box, as a place agents run in.
  "agent-sandbox": "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  // A folder with a tick.
  "trusted-sources": "M4 7h6l2 2h8v10H4zM9 14l2 2 4-4",
  // The info mark.
  about: "M12 4a8 8 0 110 16 8 8 0 010-16zM12 11v5M12 8v.01",
};

/**
 * A Settings section's icon (visual review kit T2): an outline on the place icons' 24 grid and
 * line, in the text colour, hidden from screen readers because the row names the section.
 *
 * @example
 * <SectionIcon name="assistant" />
 */
export function SectionIcon({ name }: { readonly name: SectionIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-section-icon={name}
    >
      <path d={drawings[name]} />
    </svg>
  );
}
