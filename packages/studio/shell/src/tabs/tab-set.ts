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
  /** Whether the active tab has a place behind it, so the toolbar can show Back as unavailable. */
  readonly canGoBack: boolean;
  /** Whether the active tab has a place ahead of it. */
  readonly canGoForward: boolean;
}

/** What `openInNewTab` did: the tab showing the place, and whether it is a new one. */
export interface OpenedTab {
  readonly tab: WindowTab;
  /** `false` when a tab already showed the place, so the strip can say it is already open. */
  readonly added: boolean;
}

/** The tabs and the active one; `TabSet` works out the rest of the state from them. */
type TabsAndActive = Pick<TabSetState, "tabs" | "activeId">;

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
    this.current = stateOf({ tabs: [first], activeId: first.id });
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
   * If the active tab shows it already, nothing changes; if another tab does, that tab becomes
   * active instead.
   */
  openHere(location: TabLocation): void {
    const tab = this.active;
    if (currentLocation(tab).key === location.key) {
      return;
    }
    const open = this.tabShowing(location.key);
    if (open !== undefined) {
      this.activate(open.id);
      return;
    }
    const history = [...tab.history.slice(0, tab.position + 1), location];
    this.replace(tab.id, { ...tab, history, position: history.length - 1 });
  }

  /**
   * Opens `location` in a new tab right after the active one, which stays active (a Ctrl-click
   * or a middle-click). If a tab already shows it, nothing opens. Returns the tab showing it, and
   * whether it was added, so the strip can announce a place that is already open.
   */
  openInNewTab(location: TabLocation): OpenedTab {
    const open = this.tabShowing(location.key);
    if (open !== undefined) {
      return { tab: open, added: false };
    }
    const tab = this.createTab(location);
    this.insert(tab, this.indexOf(this.current.activeId) + 1, this.current.activeId);
    return { tab, added: true };
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
    this.remember(tab, index);
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
   * Closes every tab but `tabId`, which becomes active (the tab menu's Close other tabs). Ctrl
   * Shift T brings them back one by one, leftmost first, each in its old place.
   */
  closeOthers(tabId: string): void {
    if (this.tab(tabId) === undefined || this.current.tabs.length === 1) {
      return;
    }
    // From the right, so each one's index still holds when the ones left of it come back first.
    const others = this.current.tabs.map((tab, index) => ({ tab, index }));
    for (const { tab, index } of others.reverse()) {
      if (tab.id !== tabId) {
        this.remember(tab, index);
      }
    }
    this.update({ tabs: this.current.tabs.filter((tab) => tab.id === tabId), activeId: tabId });
  }

  /** Whether a closed tab can come back, so the tab menu can show Reopen closed tab as unusable. */
  get canReopenClosed(): boolean {
    return this.closed.length > 0;
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
   * Goes one place back in the active tab's history, even when another tab shows that place too.
   * Returns `false` when there's nothing to go back to.
   */
  back(): boolean {
    return this.step(-1);
  }

  /**
   * Goes one place forward in the active tab's history, even when another tab shows that place
   * too. Returns `false` when there's nothing ahead.
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
   * Moves the active tab exactly one place through its history. It doesn't skip places another
   * tab shows (UX decision D1, HAL-3033): Back always lands where the user just was, even if that
   * briefly shows a place in two tabs.
   */
  private step(direction: 1 | -1): boolean {
    const tab = this.active;
    const position = tab.position + direction;
    if (tab.history[position] === undefined) {
      return false;
    }
    this.replace(tab.id, { ...tab, position });
    return true;
  }

  /** Keeps a closed tab and its place for Ctrl Shift T, forgetting the oldest beyond the limit. */
  private remember(tab: WindowTab, index: number): void {
    this.closed.push({ tab, index });
    this.closed.splice(0, Math.max(0, this.closed.length - reopenableTabs));
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
   * The tab showing `key`, if any, preferring the active tab: since Back and Forward may show a
   * place in two tabs, opening it must not jump away from the tab the user is in. Home is the one
   * place several tabs may show at once (every new tab starts there), so it never counts as open.
   */
  private tabShowing(key: string): WindowTab | undefined {
    if (key === homeLocation.key) {
      return undefined;
    }
    const showing = (tab: WindowTab) => currentLocation(tab).key === key;
    return showing(this.active) ? this.active : this.current.tabs.find(showing);
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

  private update(state: TabsAndActive): void {
    this.current = stateOf(state);
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** The full state for `tabs` with `activeId` active. */
function stateOf({ tabs, activeId }: TabsAndActive): TabSetState {
  const active = tabs.find((tab) => tab.id === activeId) ?? (tabs[0] as WindowTab);
  return {
    tabs,
    activeId,
    canGoBack: active.position > 0,
    canGoForward: active.position < active.history.length - 1,
  };
}

/** `tab` with `key` retitled in its history; the same tab when the place isn't in it. */
function renamed(tab: WindowTab, key: string, title: string): WindowTab {
  if (!tab.history.some((place) => place.key === key && place.title !== title)) {
    return tab;
  }
  const history = tab.history.map((place) => (place.key === key ? { ...place, title } : place));
  return { ...tab, history };
}
