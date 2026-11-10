import { ChevronDownIcon, Menu, type MenuEntry } from "@halonicjs/studio-kit";

/** The open workspace, as its switcher shows it. */
export interface SwitcherWorkspace {
  /** Its name, such as "Acme". */
  readonly name: string;
  /** Its folder as the user knows it, such as "~/Work/acme". */
  readonly folder: string;
}

/** Props for {@link WorkspaceSwitcher}. */
export interface WorkspaceSwitcherProps {
  readonly workspace: SwitcherWorkspace;
  /** The workspace menu's rows: Recent, Open a folder…, and the rest (T3, UX 1.3, G5 part 13). */
  readonly menu: readonly MenuEntry[];
}

/**
 * The sidebar's first block (component specs 24.4): the workspace's letter mark, its name over its
 * folder, each one line ending in "…", and a chevron. It is one button, named "Workspace: Acme",
 * that opens the workspace menu.
 *
 * @example
 * <WorkspaceSwitcher workspace={{ name: "Acme", folder: "~/Work/acme" }} menu={workspaceMenu} />
 */
export function WorkspaceSwitcher({ workspace, menu }: WorkspaceSwitcherProps) {
  return (
    <Menu
      entries={menu}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Workspace: ${workspace.name}`}
          className={switcherClasses}
        >
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-sm bg-accent-soft text-body-strong text-accent-text"
          >
            {letterMark(workspace.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-start">
            <span className="truncate text-body-strong text-fg">{workspace.name}</span>
            <span className="truncate text-caption text-fg-subtle">{workspace.folder}</span>
          </span>
          <span aria-hidden="true" className="size-icon-sm shrink-0 text-fg-subtle *:size-full">
            <ChevronDownIcon />
          </span>
        </button>
      )}
    />
  );
}

// Padding 6px 8px, radius 8px, 10px between the mark and the words (component specs 24.4).
const switcherClasses = [
  "flex w-full min-w-0 items-center gap-2.5 rounded-sm px-2 py-1.5 outline-none focus-ring",
  "hover:bg-surface-muted active:bg-surface-muted aria-expanded:bg-surface-muted",
].join(" ");

/**
 * The letter in the workspace's mark: its name's first character, as a capital. A name that
 * starts with a letter outside the BMP keeps it whole.
 */
export function letterMark(name: string): string {
  const [first = ""] = Array.from(name.trim());
  return first.toLocaleUpperCase();
}
