import type { AnnouncerTimers } from "../announcer/timers.ts";
import type { FocusedAppId } from "../points/frame.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import type { SignInChannel } from "./sign-in-channel.ts";
import type { SignInContribution, SignInOutcome, SignInReading } from "./sign-ins.ts";

/** The window the prompt is in: Studio's own, or one focused app's. */
export type SignInWindow = "studio" | FocusedAppId;

/** Where a sign-in the user started is: not started, waiting in the browser, or failed. */
export type SignInProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "waiting"; readonly phrase: string | undefined }
  | { readonly kind: "failed" };

/** One sign-in the prompt shows, with its own Sign in button. */
export interface ShownSignIn {
  /** Unique in the prompt: the sign-in's id and the need's, joined by "/". */
  readonly key: string;
  readonly provider: string;
  readonly logo: string | undefined;
  readonly purpose: string;
  /** The need's name, such as the connection's. */
  readonly name: string;
  readonly progress: SignInProgress;
}

/** What one window shows now. */
export interface SignInPrompt {
  /** The sign-ins this window's app can't work without, for the modal; ordered by provider, then name. */
  readonly blocking: readonly ShownSignIn[];
  /** The others, for the band, in the same order. */
  readonly notBlocking: readonly ShownSignIn[];
  /** Whether a sign-in's state couldn't be read, for "Couldn't check your sign-ins." */
  readonly unreadable: boolean;
}

/** What {@link SignInNeeds} is built from. */
export interface SignInNeedsOptions {
  readonly window: SignInWindow;
  readonly signIns: readonly Registered<SignInContribution>[];
  /** The context of the feature with the given id, as the window builds it. */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  readonly channel: SignInChannel;
  readonly timers: Pick<AnnouncerTimers, "now">;
  /**
   * Opens a sign-in's approval page in the browser. A rejection fails the sign-in: no browser
   * opened, so the row mustn't wait for an approval that can't come.
   */
  readonly openExternal: (url: string) => Promise<void>;
  /** Where errors go; `console.error` by default. */
  readonly log?: (message: string, error: unknown) => void;
}

/** A window reads its sign-ins again on focus at most this often, in milliseconds. */
export const focusRefreshIntervalMs = 5000;

const nothingShown: SignInPrompt = { blocking: [], notBlocking: [], unreadable: false };

/**
 * The sign-ins one window shows (`shell.sign-in-needed`). It watches every sign-in the features
 * added, splits the needed ones into blocking and not blocking for the window's app, and tells the
 * other windows through the channel when a sign-in ends, so the prompt goes away in all of them.
 */
export class SignInNeeds {
  private readonly options: SignInNeedsOptions;
  private readonly log: (message: string, error: unknown) => void;
  private readonly readings = new Map<string, SignInReading>();
  private readonly progress = new Map<string, SignInProgress>();
  private readonly listeners = new Set<() => void>();
  private stopWatches: (() => void)[] = [];
  private stopChannel: (() => void) | undefined;
  /** False once stopped: a sign-in that ends later must not post on a closed channel or watch again. */
  private running = false;
  private lastRead = Number.NEGATIVE_INFINITY;
  private shown: SignInPrompt = nothingShown;

  constructor(options: SignInNeedsOptions) {
    this.options = options;
    this.log = options.log ?? ((message, error) => console.error(message, error));
  }

  /** Starts watching the sign-ins and listening to the other windows. */
  start(): void {
    this.running = true;
    this.stopChannel ??= this.options.channel.subscribe(() => this.readAgain());
    this.readAgain();
  }

  /** Stops every watch and the channel listener. */
  stop(): void {
    this.running = false;
    this.stopChannel?.();
    this.stopChannel = undefined;
    this.stopEveryWatch();
  }

  /** What the window shows now; the same object until it changes. */
  current(): SignInPrompt {
    return this.shown;
  }

  /** Calls `listener` whenever {@link current} changes. Returns a function that stops the calls. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Runs every sign-in's `watch` again, as **Try again** does. */
  readAgain(): void {
    if (!this.running) {
      return;
    }
    this.lastRead = this.options.timers.now();
    this.stopEveryWatch();
    this.stopWatches = this.options.signIns.map((signIn) => this.watch(signIn));
  }

  /** Reads the sign-ins again when the window gets focus, at most once per {@link focusRefreshIntervalMs}. */
  windowFocused(): void {
    if (this.options.timers.now() - this.lastRead >= focusRefreshIntervalMs) {
      this.readAgain();
    }
  }

  /** Begins the sign-in with this key, as its **Sign in** button does. */
  async signIn(key: string): Promise<void> {
    const [signInId, needId] = splitKey(key);
    const signIn = this.options.signIns.find((candidate) => candidate.id === signInId);
    if (signIn === undefined || needId === undefined) {
      return;
    }
    let outcome: SignInOutcome;
    try {
      const attempt = await signIn.start(this.options.contextFor(signIn.featureId), needId);
      if (attempt.approvalUrl !== undefined) {
        await this.options.openExternal(attempt.approvalUrl);
      }
      this.setProgress(key, { kind: "waiting", phrase: attempt.phrase });
      outcome = await attempt.finished;
    } catch (error) {
      this.log(`The ${signIn.provider} sign-in "${signIn.id}" couldn't finish.`, error);
      outcome = "failed";
    }
    if (!this.running) {
      return;
    }
    this.setProgress(key, outcome === "failed" ? { kind: "failed" } : { kind: "idle" });
    this.options.channel.post();
    this.readAgain();
  }

  private watch(signIn: Registered<SignInContribution>): () => void {
    try {
      return signIn.watch(this.options.contextFor(signIn.featureId), (reading) => {
        if (reading.kind === "unreadable") {
          this.log(`Couldn't read whether the sign-in "${signIn.id}" is needed.`, reading.error);
        }
        this.readings.set(signIn.id, reading);
        this.update();
      });
    } catch (error) {
      this.log(`Couldn't watch the sign-in "${signIn.id}".`, error);
      this.readings.set(signIn.id, { kind: "unreadable", error });
      this.update();
      return () => undefined;
    }
  }

  private stopEveryWatch(): void {
    for (const stopWatch of this.stopWatches) {
      stopWatch();
    }
    this.stopWatches = [];
  }

  private setProgress(key: string, progress: SignInProgress): void {
    this.progress.set(key, progress);
    this.update();
  }

  private update(): void {
    this.shown = this.prompt();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private prompt(): SignInPrompt {
    const blocking: ShownSignIn[] = [];
    const notBlocking: ShownSignIn[] = [];
    let unreadable = false;
    for (const signIn of this.options.signIns) {
      const reading = this.readings.get(signIn.id);
      if (reading?.kind === "unreadable") {
        unreadable = true;
      }
      if (reading?.kind !== "read") {
        continue;
      }
      const blocks = this.blocks(signIn);
      for (const need of reading.needs) {
        const key = `${signIn.id}/${need.id}`;
        const progress = this.progress.get(key) ?? { kind: "idle" };
        const shown: ShownSignIn = { ...shownFields(signIn), key, name: need.name, progress };
        (blocks ? blocking : notBlocking).push(shown);
      }
    }
    return { blocking: inOrder(blocking), notBlocking: inOrder(notBlocking), unreadable };
  }

  private blocks(signIn: SignInContribution): boolean {
    const window = this.options.window;
    return window !== "studio" && signIn.blockingFor.includes(window);
  }
}

function shownFields(
  signIn: SignInContribution,
): Pick<ShownSignIn, "provider" | "logo" | "purpose"> {
  return { provider: signIn.provider, logo: signIn.logo, purpose: signIn.purpose };
}

function splitKey(key: string): [string, string | undefined] {
  const slash = key.indexOf("/");
  if (slash < 0) {
    return [key, undefined];
  }
  return [key.slice(0, slash), key.slice(slash + 1)];
}

/** By provider, then by name, so the order doesn't depend on which feature loaded first. */
function inOrder(signIns: ShownSignIn[]): readonly ShownSignIn[] {
  return signIns.sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name),
  );
}
