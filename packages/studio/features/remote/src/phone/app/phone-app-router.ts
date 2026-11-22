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

/** What the page holds from one computer while it shows it, such as its agents. */
export interface HeldComputer {
  /** Drops everything held from the computer. */
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
  | { readonly screen: "computer"; readonly computer: ComputerId; readonly sheet: boolean }
  | { readonly screen: "computers" };

/** What the phone app shows now. */
export interface PhoneAppView {
  readonly screen: PhoneAppScreen;
  /** `PhoneTunnel.pairedComputers()`'s last answer; `undefined` until the first. */
  readonly computers: readonly ListedComputer[] | KeysUnavailable | undefined;
  readonly statuses: ReadonlyMap<ComputerId, PhoneStatus>;
  /** False on the first screen: Android back then leaves the app. */
  readonly canGoBack: boolean;
}

export interface PhoneAppRouterOptions {
  readonly tunnel: PhoneTunnel;
  readonly scanner: PhoneScanner;
  /** Starts holding what the page keeps from a computer; none until the gateway client is mounted. */
  readonly hold?: (computer: PairedComputer) => HeldComputer;
  /** Where a call the shell refused goes, for the log. */
  readonly report: (problem: string) => void;
}

/**
 * Which phone screen shows, for which computer, and where back goes (design on HAL-12206,
 * decision 14). It takes the tunnel's answers and statuses and never touches the DOM, so the
 * screens over it stay thin. When a computer says this phone is removed, what the page held
 * from it is dropped before any screen hears of it, so the Removed screen never shows over it.
 */
export class PhoneAppRouter {
  readonly #options: PhoneAppRouterOptions;
  #stack: readonly PhoneAppScreen[] = [{ screen: "loading" }];
  #computers: readonly ListedComputer[] | KeysUnavailable | undefined;
  readonly #statuses = new Map<ComputerId, PhoneStatus>();
  readonly #held = new Map<ComputerId, HeldComputer>();
  readonly #listeners = new Set<() => void>();
  #view: PhoneAppView;
  #unwatch: (() => void) | undefined;

  constructor(options: PhoneAppRouterOptions) {
    this.#options = options;
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
      if (status.state === "removed") this.#drop(computer);
      this.#changed();
    });
    await this.#list();
    this.#stack = [this.#fallback()];
    this.#changed();
  }

  /** The computer's standing first, then its connection, as the header label shows it. */
  stateOf(computer: PairedComputer): PhoneState | undefined {
    return computerRowState(computer, this.#statuses.get(computer.id));
  }

  /** The header label or the banner's Details: opens the status sheet. */
  openSheet(): void {
    this.#setSheet(true);
  }

  closeSheet(): void {
    this.#setSheet(false);
  }

  /** The Connected sheet's Paired computers row. */
  openComputers(): void {
    this.#setSheet(false);
    this.#push({ screen: "computers" });
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

  /** Try again and Try now: connect at once. */
  tryAgain(computer: ComputerId): void {
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
      this.#statuses.delete(computer.id);
      await this.#list();
      const kept = this.#stack.filter(
        (screen) => screen.screen !== "computer" || screen.computer !== computer.id,
      );
      this.#stack = kept.some((screen) => screen.screen === "computer")
        ? kept
        : [this.#fallback(), ...kept];
      this.#changed();
    }
    return outcome;
  }

  /** Android back: closes the sheet, else goes back a screen. False when there's nowhere to go. */
  back(): boolean {
    const top = this.#top();
    if (top.screen === "computer" && top.sheet) {
      this.#setSheet(false);
      return true;
    }
    if (this.#stack.length < 2) return false;
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
  }

  #open(computer: PairedComputer): PhoneAppScreen {
    if (computer.standing === "paired" && !this.#held.has(computer.id)) {
      const held = this.#options.hold?.(computer);
      if (held !== undefined) this.#held.set(computer.id, held);
    }
    if (computer.standing === "paired") this.tryAgain(computer.id);
    return { screen: "computer", computer: computer.id, sheet: false };
  }

  /** The readable computer connected last, else Pair with a computer. */
  #fallback(): PhoneAppScreen {
    const next = latest(this.#computers);
    return next === undefined ? this.#pairScreen() : this.#open(next);
  }

  #pairScreen(again?: ComputerId): PhoneAppScreen {
    const options = again === undefined ? {} : { again };
    return {
      screen: "pair",
      flow: new PhonePairingFlow(this.#options.tunnel, this.#options.scanner, options),
    };
  }

  #drop(computer: ComputerId): void {
    this.#held.get(computer)?.dispose();
    this.#held.delete(computer);
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

  #setSheet(sheet: boolean): void {
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
      canGoBack: this.#stack.length > 1 || this.#sheetOpen(),
    };
  }

  #sheetOpen(): boolean {
    const top = this.#top();
    return top.screen === "computer" && top.sheet;
  }

  #changed(): void {
    this.#view = this.#build();
    for (const listener of [...this.#listeners]) listener();
  }
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
