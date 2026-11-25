import { encodePairingQr, type PairingQrPayload } from "@halonicjs/ports";
import type { NearbyId } from "./nearby-computers.ts";
import {
  isPhoneKeyProblem,
  type PairingFrom,
  type PairingProblemScreen,
  type PairingStop,
  problemScreen,
} from "./phone-pairing.ts";
import type {
  ComputerId,
  PairedComputer,
  PairingId,
  PhoneKeyProblem,
  PhoneTunnel,
  TunnelPairingStart,
} from "./phone-tunnel.ts";

/**
 * The phone's camera scanner, as the screens use it. The Android shell's `tauriPairingScanner`
 * (`apps/studio/src/connect/pair-scan.ts`, D3) has this shape.
 */
export interface PhoneScanner {
  scan(): Promise<
    | { readonly kind: "pairingCode"; readonly payload: PairingQrPayload }
    | { readonly kind: "notAPairingCode" | "closed" | "noScanner" }
    | { readonly kind: "noCamera"; readonly askAgain: boolean }
  >;
  close(): Promise<void>;
}

/**
 * A computer picked on the typed route: one found on this Wi-Fi by its {@link NearbyId}, whose
 * address only the shell holds, or one by its `host[:port]` and whether it is on this Wi-Fi.
 */
export type PickedComputer =
  | { readonly name: string; readonly nearby: NearbyId }
  | { readonly name: string; readonly endpoint: string; readonly wifi: boolean };

/** What the typed route sent last, so Type a code shows it again after a wrong code (`p-m9`). */
export interface TypedDraft {
  readonly code: string;
  readonly computer: PickedComputer;
}

/** The typed code as the computer reads it: without spaces or the middle dots, in capitals. */
export function cleanTypedCode(code: string): string {
  return code.replaceAll(/\s|·/g, "").toUpperCase();
}

/**
 * The step the pairing screens show:
 * `start` (`p-m1`; `scanner` false when this build has none), `scanning` (`p-m2`; `notHalonic`
 * while a code that isn't ours is in view, G7), `noCamera` (G8), `typed` (`p-m5`, or `p-m9` with
 * `triesLeft`), `connecting` (G9), `check` (`p-m3`), `paired` (`p-m4`) and `problem` (`p-m6` to
 * `p-m10`, G25, G26). `phoneProblem` is the phone's own problem (microcopy 28): Nearby devices
 * turned down, a saved key it can't read, or key storage that doesn't work.
 */
export type PairingView =
  | { readonly step: "start"; readonly scanner: boolean }
  | { readonly step: "scanning"; readonly notHalonic: boolean }
  | { readonly step: "noCamera" }
  | { readonly step: "typed"; readonly triesLeft?: number }
  | { readonly step: "connecting"; readonly route: "qr" | "typed" }
  | { readonly step: "check"; readonly checkCode: string; readonly computerName: string }
  | { readonly step: "paired"; readonly computer: PairedComputer }
  | {
      readonly step: "problem";
      readonly problem: PairingProblemScreen;
      readonly route: "qr" | "typed";
      readonly computerName: string;
    }
  | {
      readonly step: "phoneProblem";
      readonly problem: PhoneKeyProblem;
      readonly route: "qr" | "typed";
      readonly computerName: string;
    };

/** How long "This isn't a Halonic pairing code." stays after the last such read (G7). */
export const NOT_HALONIC_MS = 3000;

/**
 * The pause before the scanner looks again after a code that isn't ours. The plugin closes the
 * camera after every read, so without it a code that stays in view would reopen the camera
 * again and again.
 */
export const RESCAN_MS = 1000;

/**
 * For a call that only tidies up after the person has moved on: closing the camera or ending a
 * pairing on the shell's side. Its failure has no screen to show, and the shell has its own
 * safety net for both (it closes the camera on page load; a pairing ends after 2 minutes).
 */
const tidyUpFailed = (): void => undefined;

export interface PairingFlowOptions {
  /** Pairing again with a computer already on the list keeps its entry. */
  readonly again?: ComputerId;
  readonly setTimer?: (run: () => void, ms: number) => () => void;
}

/**
 * Walks one pairing through its screens. Every answer belongs to the attempt that asked: once
 * the person cancels, closes the scanner or starts again, a late answer changes nothing.
 */
export class PhonePairingFlow {
  private current: PairingView = { step: "start", scanner: true };
  /** False once the shell said this build has no scanner; every way back to the start keeps it. */
  private hasScanner = true;
  private readonly listeners = new Set<() => void>();
  private attempt = 0;
  private pairing: PairingId | undefined;
  private last: { start: TunnelPairingStart; from: PairingFrom; name: string } | undefined;
  private draft: TypedDraft | undefined;
  private clearNotHalonic: (() => void) | undefined;
  private readonly setTimer: NonNullable<PairingFlowOptions["setTimer"]>;
  private readonly tunnel: PhoneTunnel;
  private readonly scanner: PhoneScanner;
  private readonly options: PairingFlowOptions;

  constructor(tunnel: PhoneTunnel, scanner: PhoneScanner, options: PairingFlowOptions = {}) {
    this.tunnel = tunnel;
    this.scanner = scanner;
    this.options = options;
    this.setTimer =
      options.setTimer ??
      ((run, ms) => {
        const timer = setTimeout(run, ms);
        return () => clearTimeout(timer);
      });
  }

  get view(): PairingView {
    return this.current;
  }

  /** For `useSyncExternalStore`: runs after every change of {@link view}. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Scan code, or Scan again: opens the camera and waits for a code. */
  scan(): void {
    const attempt = this.next({ step: "scanning", notHalonic: false });
    void this.readScanner(attempt);
  }

  /**
   * The scanner's X, Android back or a route change away from it: the camera always closes,
   * whatever the scanner is doing (Priya, HAL-12577).
   */
  closeScanner(): void {
    this.scanner.close().catch(tidyUpFailed);
    if (this.current.step === "scanning") this.next(this.start());
  }

  /** Type a code instead, or Type a code again. */
  typeInstead(): void {
    this.next({ step: "typed" });
  }

  /** The code and computer the typed route sent last, if any. */
  get typedDraft(): TypedDraft | undefined {
    return this.draft;
  }

  /**
   * Pair on the typed route. The field accepts the code with or without spaces. A computer found
   * on this Wi-Fi goes by its id: the shell turns it into the address (HAL-16829).
   */
  pairTyped(code: string, computer: PickedComputer): void {
    this.draft = { code, computer };
    const again = this.options.again === undefined ? {} : { again: this.options.again };
    const cleaned = cleanTypedCode(code);
    const start: TunnelPairingStart =
      "nearby" in computer
        ? { route: "typed", code: cleaned, nearby: computer.nearby, ...again }
        : { route: "typed", code: cleaned, endpoint: computer.endpoint, ...again };
    const wifi = "nearby" in computer || computer.wifi;
    this.begin({ start, from: { route: "typed", wifi }, name: computer.name });
  }

  /** Try again on Can't reach and Too many tries: the same code, the same computer. */
  tryAgain(): void {
    if (this.last !== undefined) this.begin(this.last);
  }

  /** Scan again or Type a code again, by the route this pairing took. */
  again(): void {
    if (this.last?.from.route === "typed") this.typeInstead();
    else this.scan();
  }

  /** Past the start and not yet paired: Back has a step to go back to (C48 BK1). */
  get underway(): boolean {
    return this.current.step !== "start" && this.current.step !== "paired";
  }

  /**
   * Back while the pairing is under way: back to the start, closing the camera or ending the
   * pairing on both sides. False when there's no step to go back to.
   */
  backToStart(): boolean {
    if (!this.underway) return false;
    if (this.current.step === "scanning") this.closeScanner();
    else this.cancel();
    return true;
  }

  /** Cancel on Check the code or a problem screen: ends the pairing on both sides. */
  cancel(): void {
    const pairing = this.pairing;
    this.pairing = undefined;
    this.next(this.start());
    if (pairing !== undefined) this.tunnel.cancelPairing(pairing).catch(tidyUpFailed);
  }

  private async readScanner(attempt: number): Promise<void> {
    const answer = await this.scanner.scan().catch(() => ({ kind: "closed" }) as const);
    if (attempt !== this.attempt) return;
    switch (answer.kind) {
      case "pairingCode": {
        const { payload } = answer;
        const start: TunnelPairingStart = {
          route: "qr",
          scanned: encodePairingQr(payload).text,
          ...(this.options.again === undefined ? {} : { again: this.options.again }),
        };
        this.begin({ start, from: { route: "qr" }, name: payload.hostName });
        return;
      }
      case "notAPairingCode":
        // The scanner keeps looking; the hint comes back 3 s after the last such read.
        this.clearNotHalonic?.();
        this.clearNotHalonic = this.setTimer(() => {
          if (attempt === this.attempt) this.show({ step: "scanning", notHalonic: false });
        }, NOT_HALONIC_MS);
        if (this.current.step === "scanning" && !this.current.notHalonic) {
          this.show({ step: "scanning", notHalonic: true });
        }
        this.setTimer(() => {
          if (attempt === this.attempt) void this.readScanner(attempt);
        }, RESCAN_MS);
        return;
      case "noCamera":
        this.next({ step: "noCamera" });
        return;
      case "noScanner":
        this.hasScanner = false;
        this.next(this.start());
        return;
      case "closed":
        this.next(this.start());
        return;
    }
  }

  private begin(last: NonNullable<PhonePairingFlow["last"]>): void {
    this.last = last;
    const attempt = this.next({ step: "connecting", route: last.start.route });
    void this.run(attempt, last);
  }

  private async run(attempt: number, { start, from, name }: NonNullable<PhonePairingFlow["last"]>) {
    const stop = (problem: PairingStop) => {
      this.pairing = undefined;
      const screen = problemScreen(problem, from);
      if (screen.screen === "typedWrong") this.next({ step: "typed", triesLeft: screen.triesLeft });
      else this.next({ step: "problem", problem: screen, route: start.route, computerName: name });
    };
    const phoneProblem = (problem: PhoneKeyProblem) => {
      this.pairing = undefined;
      this.next({ step: "phoneProblem", problem, route: start.route, computerName: name });
    };
    const unreachable = { kind: "cant-reach", reason: "unreachable" } as const;
    const step = await this.tunnel.startPairing(start).catch(() => unreachable);
    if (attempt !== this.attempt) {
      // Cancelled while connecting: the shell's pairing still ends.
      if (step.kind === "check") this.tunnel.cancelPairing(step.pairing).catch(tidyUpFailed);
      return;
    }
    if (isPhoneKeyProblem(step)) return phoneProblem(step);
    if (step.kind !== "check") return stop(step);
    this.pairing = step.pairing;
    this.next({ step: "check", checkCode: step.checkCode, computerName: step.computerName });
    const checking = this.attempt;
    const outcome = await this.tunnel.waitForAllow(step.pairing).catch(() => unreachable);
    if (checking !== this.attempt) return;
    if (outcome.kind !== "paired") {
      // A wait that failed may leave the pairing open on the shell's side; Try again starts anew.
      this.tunnel.cancelPairing(step.pairing).catch(tidyUpFailed);
      return isPhoneKeyProblem(outcome) ? phoneProblem(outcome) : stop(outcome);
    }
    this.pairing = undefined;
    this.next({ step: "paired", computer: outcome.computer });
  }

  /** Pair with a computer, with Scan code only when this build has a scanner. */
  private start(): PairingView {
    return { step: "start", scanner: this.hasScanner };
  }

  /** A new step: answers to the step before it are dropped. */
  private next(view: PairingView): number {
    this.clearNotHalonic?.();
    this.clearNotHalonic = undefined;
    this.attempt += 1;
    this.show(view);
    return this.attempt;
  }

  private show(view: PairingView): void {
    this.current = view;
    for (const listener of this.listeners) listener();
  }
}
