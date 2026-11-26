import { computerRowState } from "../paired-computers.tsx";
import { PhonePairingFlow, type PhoneScanner } from "../pairing-flow.ts";
import type { PhoneState } from "../phone-status.ts";
import type {
  ComputerId,
  ForgetOutcome,
  KeysUnavailable,
  ListedComputer,
  PairedComputer,
  PhoneStatus,
  PhoneTunnel,
} from "../phone-tunnel.ts";
import type { PhoneRemote } from "../remote-view.ts";
import { type SavedDataStore, SavedMessaging } from "../saved-messaging.ts";
import { type FirstReach, FirstReaches } from "./first-reaches.ts";

/** The sheet over a computer's screen: the header label's status sheet, or Check this connection. */
export type ComputerSheet = "none" | "status" | "check";

/**
 * What the page holds from one computer while it shows it: its gateway client, whose view the
 * Agents list, the run detail and the status sheet show.
 */
export interface HeldComputer extends PhoneRemote {
  /** Drops everything held from the computer, as when it removes this phone. */
  dispose(): void;
}

/**
 * One screen of the phone app. `address` is the 0.1 connect screen, which the page draws
 * outside this app.
 */
export type PhoneAppScreen =
  | { readonly screen: "loading" }
  | { readonly screen: "pair"; readonly flow: PhonePairingFlow }
  | { readonly screen: "address" }
  | {
      readonly screen: "computer";
      readonly computer: ComputerId;
      readonly sheet: ComputerSheet;
      /** The agent whose run detail shows in place of the Agents list, if any. */
      readonly run?: string;
    }
  | { readonly screen: "computers" };

/** What the phone app shows now. */
export interface PhoneAppView {
  readonly screen: PhoneAppScreen;
  /** `PhoneTunnel.pairedComputers()`'s last answer; `undefined` until the first. */
  readonly computers: readonly ListedComputer[] | KeysUnavailable | undefined;
  readonly statuses: ReadonlyMap<ComputerId, PhoneStatus>;
  /** False on the first screen: Android back then leaves the app. */
  readonly canGoBack: boolean;
  /**
   * The computer forgotten last from its own screen (Removed or Can't confirm), whose screen has
   * gone: the app says it is forgotten. Paired computers says so itself.
   */
  readonly forgotten?: ListedComputer;
}

export interface PhoneAppRouterOptions {
  readonly tunnel: PhoneTunnel;
  readonly scanner: PhoneScanner;
  /** Starts holding what the page keeps from a computer when its screen opens; none in some tests. */
  readonly hold?: (computer: PairedComputer) => HeldComputer;
  /** What the phone saved of each computer's Inbox and Messenger; none in some tests. */
  readonly saved?: SavedDataStore;
  /** Where a call the shell refused goes, for the log. */
  readonly report: (problem: string) => void;
  /** The phone's clock; a test sets its own. */
  readonly clock?: () => Date;
}

/**
 * Which phone screen shows, for which computer, and where back goes (design on HAL-12206,
 * decision 14). It takes the tunnel's answers and statuses and never touches the DOM, so the
 * screens over it stay thin. When a computer says this phone is removed, what the page held
 * from it is dropped before any screen hears of it, so the Removed screen never shows over it.
 * Until a computer first answers, it counts the first reach and gives up after 30 seconds.
 */
export class PhoneAppRouter {
  readonly #options: PhoneAppRouterOptions;
  #stack: readonly PhoneAppScreen[] = [{ screen: "loading" }];
  #computers: readonly ListedComputer[] | KeysUnavailable | undefined;
  readonly #statuses = new Map<ComputerId, PhoneStatus>();
  readonly #held = new Map<ComputerId, HeldComputer>();
  readonly #saved = new Map<ComputerId, SavedMessaging>();
  readonly #reaches: FirstReaches;
  readonly #listeners = new Set<() => void>();
  #forgotten: ListedComputer | undefined;
  #view: PhoneAppView;
  #unwatch: (() => void) | undefined;

  constructor(options: PhoneAppRouterOptions) {
    this.#options = options;
    this.#reaches = new FirstReaches(
      () => options.clock?.() ?? new Date(),
      () => this.#changed(),
    );
    this.#view = this.#build();
  }

  get view(): PhoneAppView {
    return this.#view;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Lists the computers and opens the one connected last, else Pair with a computer. */
  async start(): Promise<void> {
    this.#unwatch = this.#options.tunnel.onStatus((computer, status) => {
      this.#statuses.set(computer, status);
      if (status.state === "removed") {
        this.#drop(computer);
        this.#clearSaved(computer);
      }
      this.#reaches.follow(computer, status);
      this.#changed();
    });
    await this.#list();
    this.#stack = [this.#fallback()];
    this.#changed();
  }

  /**
   * The computer's standing first, then its connection, as the header label shows it. A first
   * reach that gave up reads as not answering, also while the tunnel still tries in the background.
   */
  stateOf(computer: PairedComputer): PhoneState | undefined {
    const state = computerRowState(computer, this.#statuses.get(computer.id));
    const gaveUp = this.#reaches.get(computer.id)?.gaveUp === true;
    return gaveUp && (state === undefined || state === "reconnecting") ? "unreachable" : state;
  }

  /** The first reach of a computer the phone hasn't reached since it opened it, if under way. */
  reachOf(computer: ComputerId): FirstReach | undefined {
    return this.#reaches.get(computer);
  }

  /** The gateway client of a computer whose screen opened, until it is removed or forgotten. */
  remoteOf(computer: ComputerId): PhoneRemote | undefined {
    return this.#held.get(computer);
  }

  /**
   * What the phone saved of a computer's Inbox and Messenger, one instance per computer until it
   * is forgotten or removed; `undefined` without a store.
   */
  savedOf(computer: ComputerId): SavedMessaging | undefined {
    const store = this.#options.saved;
    if (store === undefined) return undefined;
    const kept = this.#saved.get(computer) ?? new SavedMessaging(store, computer);
    this.#saved.set(computer, kept);
    return kept;
  }

  /** An agent's row was tapped: its run detail shows in place of the Agents list. */
  openRun(sessionId: string): void {
    const top = this.#top();
    if (top.screen !== "computer") return;
    this.#stack = [...this.#stack.slice(0, -1), { ...top, sheet: "none", run: sessionId }];
    this.#changed();
  }

  /** The run detail's Back, and an agent that left the list while open: back to Agents. */
  closeRun(): void {
    const top = this.#top();
    if (top.screen !== "computer" || top.run === undefined) return;
    this.#stack = [...this.#stack.slice(0, -1), withoutRun(top)];
    this.#changed();
  }

  /** The header label or the banner's Details: opens the status sheet. */
  openSheet(): void {
    this.#setSheet("status");
  }

  /** Something wrong? and the give-up's Check this connection. */
  openCheck(): void {
    this.#setSheet("check");
  }

  closeSheet(): void {
    this.#setSheet("none");
  }

  /** The Connected sheet's Paired computers row. */
  openComputers(): void {
    // One change: closing the sheet on its own first would take the page's history entry away,
    // and opening the screen would add it again (C48 HB1).
    const top = this.#top();
    const under = top.screen === "computer" ? { ...top, sheet: "none" as const } : top;
    this.#stack = [...this.#stack.slice(0, -1), under, { screen: "computers" }];
    this.#changed();
    void this.#list().then(() => this.#changed());
  }

  /** Pair with a computer, or Pair again with `again`, which keeps its entry. */
  pair(again?: ComputerId): void {
    this.#push(this.#pairScreen(again));
  }

  /** The typed route's "Not listed? Enter its address": the 0.1 connect screen. */
  enterAddress(): void {
    this.#push({ screen: "address" });
  }

  /** Paired, then Open agents: that computer's screen, with nothing to go back to. */
  async openPaired(computer: PairedComputer): Promise<void> {
    await this.#list();
    this.#stack = [this.#open(computer)];
    this.#changed();
  }

  /**
   * Try again, Try now and Check again: connect at once. During a first reach it starts the wait
   * over, and the last try's failure is forgotten until the tunnel says how this one went. An
   * offline phone stays offline: that is the phone's own state, not a try's failure.
   */
  tryAgain(computer: ComputerId): void {
    if (this.#reaches.has(computer)) {
      if (!phoneIsOffline(this.#statuses.get(computer))) this.#statuses.delete(computer);
      this.#startReach(computer);
      this.#changed();
    }
    this.#connect(computer);
  }

  #connect(computer: ComputerId): void {
    // A refused call changes nothing here: the shell's statuses say how the connection is.
    this.#options.tunnel.connect(computer).catch(() => this.#options.report("connect was refused"));
  }

  /** Lists the computers again, as after `keys-unavailable`. */
  async refresh(): Promise<void> {
    await this.#list();
    this.#changed();
  }

  /**
   * Forgets a computer: the shell deletes its entry, the page drops what it held, and its
   * screens leave the stack, so Back never returns to it. With no computer's screen left, the
   * next computer goes underneath, else Pair with a computer.
   */
  async forget(computer: ListedComputer): Promise<ForgetOutcome> {
    const outcome = await this.#options.tunnel.forget(computer.id);
    if (outcome.kind === "forgotten") {
      this.#drop(computer.id);
      this.#clearSaved(computer.id);
      this.#reaches.stop(computer.id);
      this.#statuses.delete(computer.id);
      await this.#list();
      const kept = this.#stack.filter(
        (screen) => screen.screen !== "computer" || screen.computer !== computer.id,
      );
      if (this.#top().screen !== "computers") this.#forgotten = computer;
      this.#stack = kept.some((screen) => screen.screen === "computer")
        ? kept
        : [this.#fallback(), ...kept];
      this.#changed();
    }
    return outcome;
  }

  /**
   * Android back: closes the sheet, else the run detail, else goes back a screen. A pairing
   * under way on the first screen goes back to its start. False when there's nowhere to go.
   */
  back(): boolean {
    const top = this.#top();
    if (top.screen === "computer" && top.sheet !== "none") {
      this.#setSheet("none");
      return true;
    }
    if (top.screen === "computer" && top.run !== undefined) {
      this.closeRun();
      return true;
    }
    if (this.#stack.length < 2) return top.screen === "pair" && top.flow.backToStart();
    // Leaving Check the code or a problem screen ends the pairing on both sides.
    if (top.screen === "pair") top.flow.cancel();
    this.#stack = this.#stack.slice(0, -1);
    this.#changed();
    return true;
  }

  /** Stops listening and drops everything held. */
  dispose(): void {
    this.#unwatch?.();
    for (const computer of [...this.#held.keys()]) this.#drop(computer);
    this.#reaches.stopAll();
  }

  #open(computer: PairedComputer): PhoneAppScreen {
    if (computer.standing === "paired" && !this.#held.has(computer.id)) {
      const held = this.#options.hold?.(computer);
      if (held !== undefined) this.#held.set(computer.id, held);
    }
    if (computer.standing === "paired") {
      this.#startReach(computer.id);
      this.#connect(computer.id);
    }
    return { screen: "computer", computer: computer.id, sheet: "none" };
  }

  /**
   * Starts, or starts over, the first reach's wait, unless the computer already answers. While
   * the phone is offline or the app away, the wait starts held.
   */
  #startReach(computer: ComputerId): void {
    const status = this.#statuses.get(computer);
    if (status?.state !== "connected") this.#reaches.start(computer, status);
  }

  /** The readable computer connected last, else Pair with a computer. */
  #fallback(): PhoneAppScreen {
    const next = latest(this.#computers);
    return next === undefined ? this.#pairScreen() : this.#open(next);
  }

  #pairScreen(again?: ComputerId): PhoneAppScreen {
    const options = again === undefined ? {} : { again };
    const flow = new PhonePairingFlow(this.#options.tunnel, this.#options.scanner, options);
    // Whether Back has somewhere to go can change with the pairing's step (C48 BK1).
    flow.subscribe(() => {
      const top = this.#top();
      if (top.screen === "pair" && top.flow === flow) this.#changed();
    });
    return { screen: "pair", flow };
  }

  /** Drops what the page held from `computer`, and closes its run details, which showed it. */
  #drop(computer: ComputerId): void {
    this.#held.get(computer)?.dispose();
    this.#held.delete(computer);
    this.#stack = this.#stack.map((screen) =>
      screen.screen === "computer" && screen.computer === computer ? withoutRun(screen) : screen,
    );
  }

  /**
   * Deletes what the phone saved of `computer`, as on Forget and Removed: through its
   * `SavedMessaging`, so a write still queued can't bring the text back after the clear.
   */
  #clearSaved(computer: ComputerId): void {
    const saved = this.savedOf(computer);
    this.#saved.delete(computer);
    saved?.forget().catch(() => this.#options.report("clearing the saved data was refused"));
  }

  async #list(): Promise<readonly ListedComputer[] | KeysUnavailable> {
    this.#computers = await this.#options.tunnel.pairedComputers();
    return this.#computers;
  }

  #top(): PhoneAppScreen {
    return this.#stack.at(-1) ?? { screen: "loading" };
  }

  #push(screen: PhoneAppScreen): void {
    this.#stack = [...this.#stack, screen];
    this.#changed();
  }

  #setSheet(sheet: ComputerSheet): void {
    const top = this.#top();
    if (top.screen !== "computer" || top.sheet === sheet) return;
    this.#stack = [...this.#stack.slice(0, -1), { ...top, sheet }];
    this.#changed();
  }

  #build(): PhoneAppView {
    return {
      screen: this.#top(),
      computers: this.#computers,
      statuses: new Map(this.#statuses),
      canGoBack: this.#stack.length > 1 || this.#somewhereOnScreen(),
      ...(this.#forgotten === undefined ? {} : { forgotten: this.#forgotten }),
    };
  }

  /** A sheet or run detail is open, or a pairing is under way: Back has a step on this screen. */
  #somewhereOnScreen(): boolean {
    const top = this.#top();
    if (top.screen === "pair") return top.flow.underway;
    return top.screen === "computer" && (top.sheet !== "none" || top.run !== undefined);
  }

  #changed(): void {
    this.#view = this.#build();
    for (const listener of [...this.#listeners]) listener();
  }
}

type ComputerScreen = Extract<PhoneAppScreen, { readonly screen: "computer" }>;

/** A computer's screen with its Agents list, not a run detail. */
function withoutRun({ run: _run, ...screen }: ComputerScreen): ComputerScreen {
  return screen;
}

/** The tunnel's last try met no network on the phone. */
function phoneIsOffline(status: PhoneStatus | undefined): boolean {
  return status?.state === "reconnecting" && status.lastTry === "network-down";
}

/** The readable computer connected last, else paired last. */
function latest(
  computers: readonly ListedComputer[] | KeysUnavailable | undefined,
): PairedComputer | undefined {
  if (!Array.isArray(computers)) return undefined;
  const readable = computers.filter(
    (computer): computer is PairedComputer => computer.standing !== "unreadable",
  );
  const when = (computer: PairedComputer) => computer.lastConnectedAt ?? computer.pairedAt;
  return readable.sort((a, b) => when(b).localeCompare(when(a)))[0];
}
