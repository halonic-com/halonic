import { type ReactNode, useLayoutEffect, useRef, useSyncExternalStore } from "react";

/** One row of a part's table: one state, drawn once light and once dark. */
export interface StateRow {
  /** The row's name, as on the states sheet: "Default", "Hover", "Unavailable". */
  readonly name: string;
  /**
   * A forced state. `hover` becomes `active` below 600px, and the row is then called Pressed,
   * because a phone has no hover (component specs 0.2).
   */
  readonly force?: "hover" | "focus";
  /**
   * Where the forced state goes, as a selector inside the cell: the second tab, not the whole
   * Tabs. Without it, the cell's wrapper carries it and every copy in the cell shows the state.
   */
  readonly target?: string;
  readonly copies: () => ReactNode;
}

/** A part's section: its heading, what the copies in each cell are, and its rows. */
export interface PartSection {
  /** The part's folder name in src/, the section's id and its name in `?part=`. */
  readonly id: string;
  /** The spec section: "1", "2, 3", "25.1". */
  readonly number: string;
  readonly name: string;
  /** The spec, then the order of the copies in each cell: "kit 1 · left to right: …". */
  readonly order: string;
  /** The states the part doesn't have, with the reason in brackets. */
  readonly notApplicable: string;
  /**
   * Light above dark, each the table's full width, instead of side by side. For a part whose
   * layout needs the room: FormRows only puts its labels beside the values from 46.5rem.
   */
  readonly stacked?: boolean;
  readonly rows: readonly StateRow[];
}

const caption = "text-caption font-medium uppercase tracking-label text-fg-muted";

const phoneQuery = "(width < 600px)";

function subscribeToPhone(onChange: () => void): () => void {
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True below 600px, the phone layout: then the page sets the phone presentation, and hover rows
 * force a press instead.
 */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribeToPhone,
    () => window.matchMedia(phoneQuery).matches,
    () => false,
  );
}

/** The `data-force-state` value for a row, on this layout. */
export function forcedState(row: StateRow, phone: boolean): string | undefined {
  if (row.force === "hover") {
    return phone ? "active" : "hover";
  }
  return row.force;
}

/** The part's heading, its two lines, and a table with one row per state. */
export function StateTable({ section }: { readonly section: PartSection }) {
  const phone = usePhoneLayout();
  const stacked = section.stacked === true;
  return (
    <section id={section.id} className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="flex gap-3 text-heading phone:px-4">
        <span className="text-fg-muted tabular-nums">{section.number}</span>
        {section.name}
      </h2>
      <div className="phone:px-4">
        <p className="text-small text-fg-muted">{section.order}</p>
        <p className="text-small text-fg-muted">Not applicable: {section.notApplicable}</p>
      </div>
      <div className="overflow-hidden rounded-md border border-border phone:rounded-none phone:border-x-0">
        <div className="flex phone:hidden">
          <p className={`w-32 shrink-0 px-4 py-2 ${caption}`}>State</p>
          {stacked ? (
            <p className={`min-w-0 flex-1 border-l border-border px-4 py-2 ${caption}`}>
              Light, then dark
            </p>
          ) : (
            <>
              <p className={`min-w-0 flex-1 border-l border-border px-4 py-2 ${caption}`}>Light</p>
              <p className={`min-w-0 flex-1 border-l border-border px-4 py-2 ${caption}`}>Dark</p>
            </>
          )}
        </div>
        {section.rows.map((row) => (
          <div key={row.name} className="flex border-t border-border phone:flex-col">
            <p className={`w-32 shrink-0 p-4 phone:w-auto phone:pb-2 ${caption}`}>
              {row.force === "hover" && phone ? "Pressed" : row.name}
            </p>
            <div className={`flex min-w-0 flex-1 phone:flex-col ${stacked ? "flex-col" : ""}`}>
              <ThemeCell
                row={row}
                scheme="light"
                forced={forcedState(row, phone)}
                stacked={stacked}
              />
              <ThemeCell
                row={row}
                scheme="dark"
                forced={forcedState(row, phone)}
                stacked={stacked}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

const schemeClasses = { light: "scheme-light", dark: "scheme-dark" } as const;

interface ThemeCellProps {
  readonly row: StateRow;
  readonly scheme: "light" | "dark";
  readonly forced: string | undefined;
  /** Light above dark: the dark cell gets a line on top, and both say which they are. */
  readonly stacked?: boolean;
}

/**
 * One copy of a row, light or dark. The tokens are light-dark() values, so color-scheme alone
 * makes the cell dark: a light patch in a dark cell is a real bug.
 */
function ThemeCell({ row, scheme, forced, stacked = false }: ThemeCellProps) {
  const copies = useRef<HTMLDivElement>(null);
  const { target } = row;

  useLayoutEffect(() => {
    if (target === undefined || forced === undefined || copies.current === null) {
      return;
    }
    const elements = Array.from(copies.current.querySelectorAll(target));
    for (const element of elements) {
      element.setAttribute("data-force-state", forced);
    }
    return () => {
      for (const element of elements) {
        element.removeAttribute("data-force-state");
      }
    };
  }, [target, forced]);

  return (
    <div
      className={`min-w-0 flex-1 border-l border-border bg-surface p-4 text-fg phone:border-l-0 phone:border-t ${stacked && scheme === "dark" ? "border-t" : ""} ${schemeClasses[scheme]}`}
    >
      <p className={`${stacked ? "mb-2" : "mb-2 hidden phone:block"} ${caption}`}>
        {scheme === "light" ? "Light" : "Dark"}
      </p>
      <div
        ref={copies}
        data-force-state={target === undefined ? forced : undefined}
        className="flex flex-wrap items-start gap-3"
      >
        {row.copies()}
      </div>
    </div>
  );
}
