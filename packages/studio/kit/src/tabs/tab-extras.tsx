import { StatusChip } from "../status-chip/status-chip.tsx";
import { type Layout, selectedWeight } from "./tab-styles.ts";
import type { Tab, TabCount } from "./tabs.tsx";

/**
 * The label as each look needs it: plain text that wraps in `fill`, the width-keeping grid in
 * `inline`, and in `vertical` a span that takes the row's free width, so a counter sits at its end.
 */
export function TabLabel({ label, layout }: { readonly label: string; readonly layout: Layout }) {
  if (layout === "fill") {
    return label;
  }
  if (layout === "vertical") {
    return <span className="min-w-0 flex-1">{label}</span>;
  }
  return <InlineLabel label={label} />;
}

/**
 * An `inline` tab is as wide as its label, and the selected label is bolder. So the label sits in
 * a one-cell grid with an invisible bold copy that sets the width, and switching tabs doesn't move
 * the tabs after it. The visible copy keeps the weight of the tab's state.
 */
function InlineLabel({ label }: { readonly label: string }) {
  return (
    <span className="inline-grid">
      <span className="col-start-1 row-start-1">{label}</span>
      <span aria-hidden="true" className={`invisible col-start-1 row-start-1 ${selectedWeight}`}>
        {label}
      </span>
    </span>
  );
}

/**
 * A `fill` tab is at least as wide as its longest word, and the selected label is bolder. So an
 * invisible bold copy with no height holds the bold word's width, and switching tabs doesn't move
 * the tabs beside it. The label itself stays plain text, so it still wraps with its counter.
 */
export function FillWidthCopy({ label }: { readonly label: string }) {
  return (
    <span aria-hidden="true" className={`invisible block h-0 overflow-hidden ${selectedWeight}`}>
      {label}
    </span>
  );
}

/** What follows the label: the counter, else the running dot, else nothing. */
export function TabSignal({ tab, fill }: { readonly tab: Tab; readonly fill: boolean }) {
  if (tab.count !== undefined) {
    return <TabCounter count={tab.count} fill={fill} />;
  }
  if (tab.running !== undefined) {
    return <RunningDot name={tab.running.name} fill={fill} />;
  }
  return null;
}

/**
 * The still running dot (never breathing). High contrast drops fills, so there it keeps its fill
 * in `CanvasText`. Screen readers hear its name after the tab's: "Runs, 1 running".
 */
function RunningDot({ name, fill }: { readonly name: string; readonly fill: boolean }) {
  return (
    <>
      {fill ? " " : null}
      <span
        aria-hidden="true"
        className="inline-block size-1.5 shrink-0 rounded-full bg-running align-middle forced-color-adjust-none forced-colors:bg-[CanvasText]"
      />
      <span className="sr-only">, {name}</span>
    </>
  );
}

/**
 * The counter after the label. The chip hides its number from screen readers, which hear the
 * count's name instead: "Configuration, 2 errors". On a phone a space comes first, so it wraps like
 * a word.
 */
function TabCounter({ count, fill }: { readonly count: TabCount; readonly fill: boolean }) {
  return (
    <>
      {fill ? " " : null}
      <span className="inline-flex align-middle">
        <StatusChip tone={count.tone ?? "accent"} shape="count" name={count.name}>
          {count.value}
        </StatusChip>
      </span>
    </>
  );
}
