import type { PartSection } from "../state-table.tsx";
import { buttonSection } from "./button.tsx";
import { fieldSection } from "./field.tsx";

/**
 * Every part on main, in spec order, which is also the states sheet's order. A part gets its
 * section when it lands on main.
 */
export const SECTIONS: readonly PartSection[] = [buttonSection, fieldSection];
