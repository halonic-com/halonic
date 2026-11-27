import { CloseIcon, Menu, type MenuEntry, type MenuTriggerProps } from "@halonicjs/studio-kit";
import { type ReactNode, useEffect, useRef } from "react";
import type { ProjectChip, ProjectFilter } from "../agent/project-filter.ts";
import { useChipsThatFit } from "./project-line-fit.ts";
import { projectDotClass } from "./project-tag.tsx";

/** The props of {@link ProjectLine}. */
export interface ProjectLineProps {
  /** "All projects" first, then each project, then "No project" when an item waits with none. */
  readonly options: readonly ProjectChip[];
  readonly value: ProjectFilter;
  readonly onChange: (value: ProjectFilter) => void;
}

/**
 * A pill as the kit's filter chips draw it: 28px on desktop, 32px on a phone or a touch screen,
 * with a 48px hit area. "All", "+N" and the hidden copy's chips keep their width (`shrink-0`); a
 * project chip on the line may narrow, since its name cuts with "…".
 */
const chip =
  "relative inline-flex min-h-control-sm items-center gap-1.5 rounded-full border px-3 text-small transition-colors focus-ring phone:min-h-8 phone:hit-touch touch:min-h-8 touch:hit-touch";
const off =
  "border-border-control bg-surface text-fg-muted hover:bg-surface-subtle active:bg-surface-subtle";
const on =
  "border-transparent bg-accent-soft font-medium text-accent-text contrast-more:border-accent-text";

/** "No project" has no colour: a ring in the muted text colour. */
const noProjectDot = "size-2 shrink-0 rounded-full border border-fg-subtle";

/**
 * The project filter on one line (`inbox.project-line`, sketches A and C on HAL-19192): "All",
 * the projects that fit, then "+N", a menu of every choice with its count. A picked project stands
 * alone after "All" with a ×, and pressing it again goes back to all; the rest move to "+N".
 */
export function ProjectLine({ options, value, onChange }: ProjectLineProps) {
  const line = useRef<HTMLFieldSetElement>(null);
  const sample = useRef<HTMLDivElement>(null);
  const [all, ...choices] = options;
  const fit = useChipsThatFit(line, sample, choices.map((choice) => choice.label).join("\n"));
  const choose = useFocusKept(line, onChange);
  if (all === undefined) return null;
  const picked = choices.find((choice) => choice.value === value);
  const shown = picked === undefined ? choices.slice(0, fit) : [picked];
  const hidden = choices.filter((choice) => !shown.includes(choice));
  return (
    // `overflow-x-clip`: the hidden copy is as wide as every chip side by side, and without a clip
    // its overflow would scroll the whole page sideways (#6757 review).
    <div className="relative min-w-0 overflow-x-clip px-4 py-2">
      {/* A fieldset is a group already; min-w-0 lets it narrow instead of growing to its chips. */}
      <fieldset
        ref={line}
        aria-label="Project"
        className="m-0 flex min-w-0 items-center gap-2 border-0 p-0"
      >
        <button
          type="button"
          aria-pressed={picked === undefined}
          aria-label={picked === undefined ? `All projects, ${all.count}` : "All projects"}
          className={`${chip} shrink-0 ${picked === undefined ? on : off}`}
          onClick={() => choose("all")}
        >
          All
          {picked === undefined ? <span>{all.count}</span> : null}
        </button>
        {shown.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={choice === picked}
            className={`${chip} min-w-0 ${choice === picked ? on : off}`}
            onClick={() => choose(choice === picked ? "all" : choice.value)}
          >
            <ChoiceWords choice={choice} />
            {choice === picked ? (
              <span aria-hidden="true" className="inline-grid size-3 shrink-0 *:size-full">
                <CloseIcon />
              </span>
            ) : null}
          </button>
        ))}
        {hidden.length > 0 ? (
          <Menu
            trigger={(props) => <MoreButton {...props} count={hidden.length} />}
            entries={menuEntries(options, value, choose)}
          />
        ) : null}
      </fieldset>
      {/* The chips as they'd be drawn unpicked, measured to see which fit; never seen or read. */}
      <div
        ref={sample}
        aria-hidden="true"
        className="invisible absolute start-0 top-0 flex gap-2 whitespace-nowrap"
      >
        <span className={`${chip} shrink-0 ${on}`}>
          All<span>{all.count}</span>
        </span>
        {choices.map((choice) => (
          <span key={choice.value} className={`${chip} shrink-0 ${off}`}>
            <ChoiceWords choice={choice} />
          </span>
        ))}
        <span className={`${chip} shrink-0 ${off}`}>+{choices.length}</span>
      </div>
    </div>
  );
}

/**
 * Picks a choice and keeps focus on the line: when the chip or "+N" that had focus leaves it, as
 * when an unpicked project no longer fits or "+N" goes, focus moves to the pressed choice instead
 * of dropping to the page.
 */
function useFocusKept(
  line: { readonly current: HTMLElement | null },
  onChange: (value: ProjectFilter) => void,
): (value: ProjectFilter) => void {
  const picking = useRef(false);
  useEffect(() => {
    if (!picking.current) return;
    picking.current = false;
    const focused = document.activeElement;
    if (focused !== null && focused !== document.body && focused.isConnected) return;
    line.current?.querySelector<HTMLElement>('button[aria-pressed="true"]')?.focus();
  });
  return (value) => {
    // Only a pick made from the line, the "+N" menu's included, moves focus back to it.
    const focused = document.activeElement;
    picking.current = focused !== null && (line.current?.contains(focused) ?? false);
    onChange(value);
  };
}

/** A choice's dot and name, cut with "…" at 144px. */
function ChoiceWords({ choice }: { readonly choice: ProjectChip }) {
  return (
    <>
      <ChoiceDot choice={choice} />
      <span className="min-w-0 max-w-36 truncate">{choice.label}</span>
    </>
  );
}

function ChoiceDot({ choice }: { readonly choice: ProjectChip }): ReactNode {
  const dot = choice.project === undefined ? noProjectDot : projectDotClass(choice.project.id);
  return <span aria-hidden="true" className={dot} />;
}

function MoreButton({ count, ...props }: MenuTriggerProps & { readonly count: number }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={`+${count} more projects`}
      className={`${chip} shrink-0 ${off}`}
    >
      +{count}
    </button>
  );
}

/**
 * "+N"'s menu (sketch A): every choice, the ones on the line too, so it's one place to pick from,
 * each with how many items wait in it, and a check on the picked one.
 */
function menuEntries(
  options: readonly ProjectChip[],
  value: ProjectFilter,
  onChange: (value: ProjectFilter) => void,
): readonly MenuEntry[] {
  const entry = (choice: ProjectChip): MenuEntry => ({
    id: choice.value,
    label: choice.label,
    count: String(choice.count),
    // The kit hides the count's chip from a screen reader, so the name says it.
    name: `${choice.label}, ${choice.count}`,
    checked: choice.value === value,
    onSelect: () => onChange(choice.value),
    // "All projects" gets an empty dot so its name lines up with the projects' (sketch A).
    icon: (
      <span className="grid place-items-center">
        {choice.value === "all" ? (
          <span aria-hidden="true" className="size-2" />
        ) : (
          <ChoiceDot choice={choice} />
        )}
      </span>
    ),
  });
  const [all, ...choices] = options;
  const projects = choices.filter((choice) => choice.value !== "none");
  const none = choices.filter((choice) => choice.value === "none");
  return [
    ...(all === undefined ? [] : [entry(all), "divider" as const]),
    ...projects.map(entry),
    ...(none.length === 0 ? [] : ["divider" as const, ...none.map(entry)]),
  ];
}
