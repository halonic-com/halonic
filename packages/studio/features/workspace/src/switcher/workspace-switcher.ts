import type { ToastAction, ToastStore } from "@halonicjs/studio-kit";
import {
  cantOpenProblem,
  cantReopenProblem,
  copyDetails,
  copyDetailsWords,
  removeFromRecentLabel,
  type StudioWorkspace,
  type WelcomeOpenProblem,
} from "@halonicjs/studio-shell";
import { OpenWorkspaces } from "./open-workspaces.ts";
import type { RecentWorkspaces } from "./recent-workspaces.ts";

/** A workspace the app opened in a folder: what the window shows and how to let it go. */
export interface OpenedWorkspace {
  /** Its name, such as "Acme". */
  readonly name: string;
  /** Its tabs, Recent places, save state and services. */
  readonly workspace: StudioWorkspace;
  /** Stops its services. Called once, when it closes. */
  dispose(): Promise<void>;
}

/** What {@link WorkspaceSwitcher} needs from the app. */
export interface WorkspaceSwitcherOptions {
  /** Shows the folder picker; resolves with the folder's location, or `undefined` when cancelled. */
  readonly pickFolder: () => Promise<string | undefined>;
  /**
   * Opens the workspace in a folder; rejects with why it can't, a `not_found` or `denied` kind for
   * a folder that's gone or can't be read.
   */
  readonly openFolder: (location: string) => Promise<OpenedWorkspace>;
  readonly recent: RecentWorkspaces;
  /** The window's toasts, for "Opened Acme" and a menu's failed open. */
  readonly toasts: ToastStore;
  /**
   * Lets the app reach a folder the user picked before, after a restart, before a Recent row
   * opens it; rejects as {@link openFolder} does, or with a `conflict` kind when the user has to
   * pick the folder again first. The desktop shell gives a page only the folders the user chose
   * in it. Without it, a Recent row opens its folder straight away.
   */
  readonly reopenFolder?: ((location: string) => Promise<void>) | undefined;
  /** Takes the app's access to a folder away when its row leaves Recent. */
  readonly forgetFolder?: ((location: string) => Promise<void>) | undefined;
}

/**
 * The workspaces of one window and the ways to open, show and close them (flow-workspace 2.2 and
 * 2.4). Every workspace shown is remembered in Recent. Opening a folder that is already open
 * shows it, and a folder that fails to open adds no slot (`workspace.switcher.failed-open-leaves-no-slot`).
 *
 * @example
 * const switcher = new WorkspaceSwitcher({ pickFolder, openFolder, recent, toasts: shell.toasts });
 * await switcher.pickAndOpen(); // the picked folder is shown, with the toast "Opened Acme"
 */
export class WorkspaceSwitcher {
  /** The open workspaces and which one is shown. */
  readonly open = new OpenWorkspaces<OpenedWorkspace>();
  readonly recent: RecentWorkspaces;
  readonly #options: WorkspaceSwitcherOptions;
  readonly #listeners = new Set<() => void>();
  #busy = false;
  #buttonBusy = false;

  constructor(options: WorkspaceSwitcherOptions) {
    this.#options = options;
    this.recent = options.recent;
  }

  /**
   * Whether the switcher button shows busy: from {@link MENU_BUSY_AFTER_MS} into an open from the
   * menu until the workspace shows or the toast appears (states-flow-map O7, D9).
   */
  get busy(): boolean {
    return this.#buttonBusy;
  }

  /** Calls `listener` whenever {@link busy} changes; returns the way to stop. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Shows the folder picker and opens the folder picked. Resolves with why it couldn't, else with
   * `undefined`, as the Welcome screen's **Open folder** wants. Does nothing while another folder
   * is opening.
   */
  async pickAndOpen(): Promise<WelcomeOpenProblem | undefined> {
    if (this.#busy) {
      return undefined;
    }
    this.#busy = true;
    try {
      const location = await this.#options.pickFolder();
      return location === undefined ? undefined : await this.#open(location);
    } catch (error) {
      return cantOpenProblem("the folder", error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * Shows the workspace in a folder, opening it first when it isn't open, as a Recent row does:
   * the app reopens the folder the user picked before, then opens the workspace in it.
   */
  async openLocation(location: string): Promise<WelcomeOpenProblem | undefined> {
    if (this.#busy) {
      return undefined;
    }
    this.#busy = true;
    try {
      const { reopenFolder } = this.#options;
      if (reopenFolder !== undefined && this.open.find(location) === undefined) {
        try {
          await reopenFolder(location);
        } catch (error) {
          return cantReopenProblem(location, error);
        }
      }
      return await this.#open(location);
    } catch (error) {
      return cantOpenProblem(location, error);
    } finally {
      this.#busy = false;
    }
  }

  /**
   * Removes a workspace from Recent, as **Remove from Recent** does, and takes the app's access to
   * its folder away unless it is open in this window.
   */
  removeFromRecent(location: string): void {
    this.recent.forget(location);
    if (this.open.find(location) !== undefined) {
      return;
    }
    // Forgetting only takes access away, and the row is gone either way. If the shell can't
    // forget it now, its entry is dropped when it falls off the shell's own list.
    this.#options.forgetFolder?.(location).catch(() => {});
  }

  /**
   * As {@link pickAndOpen} or {@link openLocation} from the workspace menu: a folder that fails
   * to open says why in a danger toast over the workspace still shown, which stays until closed
   * (states-flow-map E1 to E4). A Recent row whose folder is gone offers **Remove from Recent**
   * (E2), one whose folder has to be picked again offers **Open folder** (HAL-7058), and a reason
   * Halonic can't explain offers **Copy details** (E4). After
   * {@link MENU_BUSY_AFTER_MS} the switcher button is {@link busy} until then (D9). Does nothing
   * while another folder is opening.
   */
  async fromMenu(
    open: () => Promise<WelcomeOpenProblem | undefined>,
    fromRecent = false,
  ): Promise<void> {
    if (this.#busy) {
      return;
    }
    const timer = setTimeout(() => this.#setButtonBusy(true), MENU_BUSY_AFTER_MS);
    let problem: WelcomeOpenProblem | undefined;
    try {
      problem = await open();
    } finally {
      clearTimeout(timer);
      this.#setButtonBusy(false);
    }
    if (problem === undefined) {
      return;
    }
    const action = this.#cantOpenAction(problem, fromRecent);
    this.#options.toasts.show({
      tone: "danger",
      title: `Can't open ${problem.folder}: ${problem.reason}`,
      ...(action === undefined ? {} : { action }),
    });
  }

  /** Closes the shown workspace and stops its services (`workspace.switcher.close-keeps-a-slot`). */
  async closeShown(): Promise<void> {
    const shown = this.open.shown;
    if (shown === undefined) {
      return;
    }
    this.open.close(shown.location);
    shown.value.workspace.dispose();
    await shown.value.dispose();
  }

  /** Shows the open workspace at a position counted from 1, for Ctrl 1 to Ctrl 9. */
  showAt(position: number): void {
    if (this.open.showAt(position)) {
      this.#remember();
    }
  }

  /** Stops every open workspace's services, when the window goes. */
  async dispose(): Promise<void> {
    for (const slot of this.open.all) {
      this.open.close(slot.location);
      slot.value.workspace.dispose();
      await slot.value.dispose();
    }
  }

  async #open(location: string): Promise<WelcomeOpenProblem | undefined> {
    if (this.open.find(location) !== undefined) {
      this.open.show(location);
      this.#remember();
      return undefined;
    }
    let opened: OpenedWorkspace;
    try {
      opened = await this.#options.openFolder(location);
    } catch (error) {
      return cantOpenProblem(location, error);
    }
    this.open.add(location, opened);
    this.#remember();
    this.#options.toasts.show({ tone: "success", title: `Opened ${opened.name}` });
    return undefined;
  }

  /** The failed open's toast action: Copy details, Remove from Recent, Open folder, or none. */
  #cantOpenAction(problem: WelcomeOpenProblem, fromRecent: boolean): ToastAction | undefined {
    const { details } = problem;
    if (details !== undefined) {
      const { toasts } = this.#options;
      return { label: copyDetailsWords.label, onClick: () => void copyDetails(details, toasts) };
    }
    if (fromRecent && problem.kind === "not_found") {
      return { label: removeFromRecentLabel, onClick: () => this.removeFromRecent(problem.folder) };
    }
    if (problem.pickAgain === true) {
      return {
        label: openFolderLabel,
        onClick: () => void this.fromMenu(() => this.pickAndOpen()),
      };
    }
    return undefined;
  }

  #setButtonBusy(busy: boolean): void {
    if (this.#buttonBusy === busy) {
      return;
    }
    this.#buttonBusy = busy;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #remember(): void {
    const shown = this.open.shown;
    if (shown !== undefined) {
      this.recent.remember({ location: shown.location, name: shown.value.name });
    }
  }
}

/** The toast action that shows the folder picker, as the menu's "Open a folder…" does. */
export const openFolderLabel = "Open folder";

/** How long an open from the menu runs before the switcher button shows busy (kit busy rule). */
export const MENU_BUSY_AFTER_MS = 300;

/**
 * A workspace's name from its folder's location, until the workspace's own name is read from its
 * files: the folder's last part, "acme" for `/work/acme` or `Work\acme`.
 */
export function folderName(location: string): string {
  const parts = location.split(/[\\/]/).filter((part) => part !== "");
  return parts.at(-1) ?? location;
}
