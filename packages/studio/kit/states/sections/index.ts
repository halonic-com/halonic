import type { PartSection } from "../state-table.tsx";

/**
 * Every file in this folder exports one part's section, named `…Section`. Vite finds them, so a
 * new part adds its file and edits nothing shared (HAL-3626).
 */
const modules = import.meta.glob<Record<string, unknown>>("./*.tsx", { eager: true });

/** The section a file exports. A file with none, or more than one, is a mistake. */
function sectionOf(file: string, module: Record<string, unknown>): PartSection {
  const sections = Object.entries(module).filter(([name]) => name.endsWith("Section"));
  if (sections.length !== 1 || sections[0] === undefined) {
    throw new Error(`${file} must export exactly one …Section, not ${sections.length}`);
  }
  return sections[0][1] as PartSection;
}

/** "15.6, 18.4" → [15, 6]: the first spec section, as numbers. */
function specKey(section: PartSection): number[] {
  const first = section.number.split(",")[0] ?? "";
  return first
    .trim()
    .split(".")
    .map((part) => Number(part));
}

function bySpec(a: PartSection, b: PartSection): number {
  const left = specKey(a);
  const right = specKey(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return a.id.localeCompare(b.id);
}

/**
 * Every part on main, in spec order: by the first spec section in its number, then by id. A
 * part gets its section when it lands on main.
 */
export const SECTIONS: readonly PartSection[] = Object.entries(modules)
  .map(([file, module]) => sectionOf(file, module))
  .sort(bySpec);
