import { AlertIcon, Menu, type MenuTriggerProps } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { openAtFirstProblem, problemEntries, useProblemFiles } from "./problem-count.ts";
import { problemsWords } from "./problems-words.ts";

/**
 * The status bar's problem count (`files.problems.count`): "6 files with problems · Show" on every
 * page while a file of the workspace has an error, and nothing at zero. **Show** opens a menu of
 * the files; each opens its file in Files at the first problem.
 */
export function ProblemsStatusItem({ context }: StatusBarItemProps) {
  const files = useProblemFiles(context, true);
  if (files.length === 0) return null;
  const count = problemsWords.count(files.length);
  return (
    <Menu
      description={problemsWords.description}
      entries={problemEntries(files, (file) => openAtFirstProblem(context, file))}
      trigger={(props) => <ProblemCountPill {...props} count={count} />}
    />
  );
}

/** The props of `ProblemCountPill`: a Menu's trigger props on the desktop, a click on a phone. */
interface ProblemCountPillProps extends Partial<MenuTriggerProps> {
  readonly count: string;
  readonly onClick?: () => void;
}

/**
 * The pill is the danger Status chip's look (C348): its soft fill laid over surface, so the danger
 * text keeps 4.5:1 on the status bar's and the strip's subtle grey. Hover, press and an open menu
 * lay the soft fill once more and take the darker `danger-hover` text, which keeps 4.5:1 on the
 * darker fill in both themes. The edge is see-through so high contrast draws it, and danger when
 * more contrast is asked for. It's 24px high, as its status bar neighbours are (C46 PB1); on a phone
 * it wraps at large text.
 */
const pillClasses = [
  "inline-flex min-h-6 max-w-full cursor-pointer items-center gap-1 whitespace-nowrap rounded-xs px-1.5",
  "border border-transparent bg-over-surface-danger-soft text-caption text-danger",
  "transition-colors focus-ring contrast-more:border-danger",
  "hover:bg-[image:linear-gradient(var(--color-danger-soft),var(--color-danger-soft)),linear-gradient(var(--color-danger-soft),var(--color-danger-soft))] hover:text-danger-hover",
  "active:bg-[image:linear-gradient(var(--color-danger-soft),var(--color-danger-soft)),linear-gradient(var(--color-danger-soft),var(--color-danger-soft))] active:text-danger-hover",
  "aria-expanded:bg-[image:linear-gradient(var(--color-danger-soft),var(--color-danger-soft)),linear-gradient(var(--color-danger-soft),var(--color-danger-soft))] aria-expanded:text-danger-hover",
  "touch:hit-touch phone:whitespace-normal phone:px-2 phone:text-start phone:hit-touch",
].join(" ");

/** The count as one danger pill, the same on the desktop and a phone. Named "6 files with problems. Show". */
export function ProblemCountPill({ count, onClick, ...trigger }: ProblemCountPillProps) {
  return (
    <button
      type="button"
      {...trigger}
      className={pillClasses}
      aria-label={`${count}. ${problemsWords.show}`}
      onClick={onClick}
    >
      <ProblemCountWords count={count} />
    </button>
  );
}

/** Inside the pill: the alert mark, the count, then "· Show" with **Show** underlined. */
function ProblemCountWords({ count }: { readonly count: string }) {
  return (
    <>
      <span
        className="inline-grid size-3.5 shrink-0 place-items-center *:size-full"
        aria-hidden="true"
      >
        <AlertIcon />
      </span>
      <span>{count}</span>
      <span aria-hidden="true">·</span>
      <span className="underline underline-offset-2">{problemsWords.show}</span>
    </>
  );
}
