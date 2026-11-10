/**
 * Where a tab is: Home, a place such as Agents, an item, the Search page. The shell compares
 * keys, so the same key is the same place ("one item, one tab").
 */
export interface TabLocation {
  /** Such as `home`, `agents` or `agent/acme/sorter`. */
  readonly key: string;
  /** The name on the tab, such as "Support reply". */
  readonly title: string;
  /** An item's kind as a screen reader reads it after the name, such as "workflow"; places have none. */
  readonly kind?: string;
}

/** One window tab with its own history, like a browser tab. */
export interface WindowTab {
  readonly id: string;
  /** Every place this tab has shown, oldest first. Never empty. */
  readonly history: readonly TabLocation[];
  /** Where in `history` the tab is now; Back and Forward move it. */
  readonly position: number;
}

/** The tabs of one workspace, in strip order, and which one is active. */
export interface TabSetState {
  readonly tabs: readonly WindowTab[];
  readonly activeId: string;
}

/** Home, where a new tab starts and where the window goes when its last tab closes. */
export const homeLocation: TabLocation = { key: "home", title: "Home" };

/** How many closed tabs Ctrl Shift T can bring back; older ones are forgotten. */
export const reopenableTabs = 20;

/** Where a tab is now. */
export function currentLocation(tab: WindowTab): TabLocation {
  return tab.history[tab.position] ?? homeLocation;
}

/**
 * The tabs of one workspace (design direction 2): each tab keeps its own Back and Forward, the
 * same place is never open in two tabs, and the window always has a tab. Screens read `state`
 * and subscribe; every change makes a new state, so React can compare by identity.
 */
export class TabSet {
  private current: TabSetState;
  private readonly closed: { tab: WindowTab; index: number }[] = [];
  private readonly listeners = new Set<() => void>();
  private nextId = 1;

  constructor() {
    const first = this.createTab(homeLocation);
    this.current = { tabs: [first], activeId: first.id };
  }

  /** The tabs now. */
  get state(): TabSetState {
    return this.current;
  }

  /** The active tab. */
  get active(): WindowTab {
    return this.tab(this.current.activeId) ?? (this.current.tabs[0] as WindowTab);
  }

  /** Calls `listener` after every change. Returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Opens `location` in the active tab, after the place it shows, and drops that tab's Forward.
   * If another tab already shows it, that tab becomes active instead.
   */
  openHere(location: TabLocation): void {
    const open = this.tabShowing(location.key);
    if (open !== undefined) {
      this.activate(open.id);
      return;
    }
    const tab = this.active;
    const history = [...tab.history.slice(0, tab.position + 1), location];
    this.replace(tab.id, { ...tab, history, position: history.length - 1 });
  }

  /**
   * Opens `location` in a new tab right after the active one, which stays active (a Ctrl-click
   * or a middle-click). If a tab already shows it, nothing opens. Returns the tab showing it.
   */
  openInNewTab(location: TabLocation): WindowTab {
    const open = this.tabShowing(location.key);
    if (open !== undefined) {
      return open;
    }
    const tab = this.createTab(location);
    this.insert(tab, this.indexOf(this.current.activeId) + 1, this.current.activeId);
    return tab;
  }

  /** Opens a new tab on Home at the end of the strip and makes it active (+ and Ctrl T). */
  newTab(): WindowTab {
    const tab = this.createTab(homeLocation);
    this.insert(tab, this.current.tabs.length, tab.id);
    return tab;
  }

  /** Makes a tab active. */
  activate(tabId: string): void {
    if (this.tab(tabId) !== undefined && tabId !== this.current.activeId) {
      this.update({ ...this.current, activeId: tabId });
    }
  }

  /** Activates the next tab (`1`) or the previous one (`-1`), wrapping round (Ctrl Tab). */
  cycle(step: 1 | -1): void {
    const count = this.current.tabs.length;
    const index = (this.indexOf(this.current.activeId) + step + count) % count;
    this.activate(this.tabAt(index).id);
  }

  /** Activates the tab at `index`, counted from 0 (Ctrl 1–8); `-1` is the last one (Ctrl 9). */
  activateAt(index: number): void {
    const tab = index === -1 ? this.tabAt(this.current.tabs.length - 1) : this.current.tabs[index];
    if (tab !== undefined) {
      this.activate(tab.id);
    }
  }

  /**
   * Closes a tab. If it was active, the tab to its right becomes active, else the one to its
   * left. Closing the last tab leaves a tab on Home, never an empty window.
   */
  close(tabId: string): void {
    const index = this.indexOf(tabId);
    const tab = this.current.tabs[index];
    if (tab === undefined) {
      return;
    }
    this.closed.push({ tab, index });
    this.closed.splice(0, Math.max(0, this.closed.length - reopenableTabs));
    const tabs = this.current.tabs.filter((other) => other.id !== tabId);
    if (tabs.length === 0) {
      const home = this.createTab(homeLocation);
      this.update({ tabs: [home], activeId: home.id });
      return;
    }
    const activeId =
      tabId === this.current.activeId
        ? (tabs[Math.min(index, tabs.length - 1)] as WindowTab).id
        : this.current.activeId;
    this.update({ tabs, activeId });
  }

  /**
   * Brings back the last closed tab, with its history, in its old place, and makes it active
   * (Ctrl Shift T). If another tab shows its place by now, that tab becomes active instead.
   */
  reopenClosed(): void {
    const last = this.closed.pop();
    if (last === undefined) {
      return;
    }
    const open = this.tabShowing(currentLocation(last.tab).key);
    if (open !== undefined) {
      this.activate(open.id);
      return;
    }
    const tab = { ...last.tab, id: `tab-${this.nextId++}` };
    this.insert(tab, Math.min(last.index, this.current.tabs.length), tab.id);
  }

  /** Moves a tab to `index` in the strip (dragging, Ctrl Shift PageUp and PageDown). */
  move(tabId: string, index: number): void {
    const tab = this.tab(tabId);
    if (tab === undefined) {
      return;
    }
    const tabs = this.current.tabs.filter((other) => other.id !== tabId);
    const target = Math.max(0, Math.min(index, tabs.length));
    if (target === this.indexOf(tabId)) {
      return;
    }
    tabs.splice(target, 0, tab);
    this.update({ ...this.current, tabs });
  }

  /**
   * Goes back in the active tab's history, past places another tab shows now. Returns `false` when
   * there's nothing to go back to.
   */
  back(): boolean {
    return this.step(-1);
  }

  /**
   * Goes forward in the active tab's history, past places another tab shows now. Returns `false`
   * when there's nothing ahead.
   */
  forward(): boolean {
    return this.step(1);
  }

  /**
   * Gives a place a new title everywhere it appears, closed tabs included, so a renamed item's tab
   * follows at once and comes back with the new title.
   */
  rename(key: string, title: string): void {
    for (const entry of this.closed) {
      entry.tab = renamed(entry.tab, key, title);
    }
    const tabs = this.current.tabs.map((tab) => renamed(tab, key, title));
    if (tabs.some((tab, index) => tab !== this.current.tabs[index])) {
      this.update({ ...this.current, tabs });
    }
  }

  /**
   * Moves the active tab through its history, skipping places another tab shows now: stopping
   * there would show the same place twice, and switching to that tab would leave this tab's
   * Back stuck on it.
   */
  private step(direction: 1 | -1): boolean {
    const tab = this.active;
    for (let position = tab.position + direction; ; position += direction) {
      const location = tab.history[position];
      if (location === undefined) {
        return false;
      }
      const open = this.tabShowing(location.key);
      if (open === undefined || open.id === tab.id) {
        this.replace(tab.id, { ...tab, position });
        return true;
      }
    }
  }

  private createTab(location: TabLocation): WindowTab {
    return { id: `tab-${this.nextId++}`, history: [location], position: 0 };
  }

  private insert(tab: WindowTab, index: number, activeId: string): void {
    const tabs = [...this.current.tabs];
    tabs.splice(index, 0, tab);
    this.update({ tabs, activeId });
  }

  private replace(tabId: string, tab: WindowTab): void {
    const tabs = this.current.tabs.map((other) => (other.id === tabId ? tab : other));
    this.update({ ...this.current, tabs });
  }

  /**
   * The tab showing `key`, if any. Home is the one place several tabs may show at once: every new
   * tab starts there.
   */
  private tabShowing(key: string): WindowTab | undefined {
    if (key === homeLocation.key) {
      return undefined;
    }
    return this.current.tabs.find((tab) => currentLocation(tab).key === key);
  }

  private tab(tabId: string): WindowTab | undefined {
    return this.current.tabs.find((tab) => tab.id === tabId);
  }

  private tabAt(index: number): WindowTab {
    return this.current.tabs[index] as WindowTab;
  }

  private indexOf(tabId: string): number {
    return this.current.tabs.findIndex((tab) => tab.id === tabId);
  }

  private update(state: TabSetState): void {
    this.current = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** `tab` with `key` retitled in its history; the same tab when the place isn't in it. */
function renamed(tab: WindowTab, key: string, title: string): WindowTab {
  if (!tab.history.some((place) => place.key === key && place.title !== title)) {
    return tab;
  }
  const history = tab.history.map((place) => (place.key === key ? { ...place, title } : place));
  return { ...tab, history };
}
