import { type FocusedAppId, focusedAppIds } from "../points/frame.ts";
import {
  type Point,
  type PointGuard,
  PointStore,
  pointOn,
  type Registered,
} from "../points/point-store.ts";
import { ShellError } from "../shell-error.ts";
import type { WorkspaceContext } from "../workspace-context.ts";

/**
 * One sign-in that is needed now, such as one signed-out Paperclip connection. A sign-in can need
 * several at once, one per account or connection.
 */
export interface SignInNeed {
  /** Unique within its sign-in, such as the connection's id. */
  readonly id: string;
  /** What the prompt names it by, such as the connection's name "Acme team". */
  readonly name: string;
}

/**
 * What a sign-in's `watch` reports: the sign-ins needed now (none when all are done), or the error
 * that kept it from reading them.
 */
export type SignInReading =
  | { readonly kind: "read"; readonly needs: readonly SignInNeed[] }
  | { readonly kind: "unreadable"; readonly error: unknown };

/** How a sign-in the user started ended. */
export type SignInOutcome = "signed-in" | "failed";

/** A sign-in the user started, while it waits for them to approve it in their browser. */
export interface SignInAttempt {
  /** The phrase the browser shows too, so the user can check it is this sign-in, if any. */
  readonly phrase: string | undefined;
  /** The page the user approves the sign-in on, which the window opens in the browser, if any. */
  readonly approvalUrl?: string | undefined;
  /** Settles when the sign-in ends; an expired or refused one is `failed`. */
  readonly finished: Promise<SignInOutcome>;
}

/**
 * A sign-in the workspace can need, added by the feature that owns it (`shell.sign-in-needed`).
 * Every window shows it the same way: as a modal that can't be closed in the apps it blocks, and as
 * a band that can't be dismissed everywhere else.
 */
export interface SignInContribution {
  /** Unique across features, such as `connections.paperclip`. */
  readonly id: string;
  /** Who the user signs in to, as the prompt names it, such as "Paperclip". */
  readonly provider: string;
  /** The provider's logo: an image's URL, such as an imported SVG; without one, its first letter. */
  readonly logo?: string | undefined;
  /** What the band says the sign-in is for, as in "Sign in to Google to use {purpose}." */
  readonly purpose: string;
  /** The focused apps that can't work without it. Studio's own window is never blocked. */
  readonly blockingFor: readonly FocusedAppId[];
  /**
   * Calls `listener` with the sign-ins needed now, at once or soon after, and again whenever that
   * changes. Returns a function that stops the calls. The shell runs it again when another window
   * finished a sign-in, so it must read afresh each time it is called.
   */
  watch(context: WorkspaceContext, listener: (reading: SignInReading) => void): () => void;
  /**
   * Begins the sign-in for one of the needs `watch` reported, such as by opening its page in the
   * browser.
   *
   * @throws when the sign-in couldn't begin; the prompt then says it didn't finish
   */
  start(context: WorkspaceContext, needId: string): Promise<SignInAttempt>;
}

/** The point a feature adds its sign-ins through. */
export interface SignInPoints {
  /**
   * Adds a sign-in the workspace can need. Throws a `ShellError` for an id another feature added,
   * an empty provider, or an app in `blockingFor` that isn't one of `focusedAppIds`.
   */
  readonly signIns: Point<SignInContribution>;
}

/** What the shell reads to show the sign-ins. */
export interface SignInContributions {
  readonly signIns: { list(): readonly Registered<SignInContribution>[] };
}

/** Keeps the sign-ins the features add. */
export class SignInStores {
  private readonly signIns = new PointStore<SignInContribution>("signIns.add", ["id"]);

  /** The point for one feature; it stops working once `guard` says `register` returned. */
  pointsFor(featureId: string, guard: PointGuard): SignInPoints {
    const store = pointOn("signIns.add", this.signIns, featureId, guard);
    return {
      signIns: {
        add: (signIn) => {
          checkSignIn(featureId, signIn);
          store.add(signIn);
        },
      },
    };
  }

  /** The sign-ins, in the order they were added. */
  contributions(): SignInContributions {
    return { signIns: { list: () => this.signIns.all() } };
  }
}

function checkSignIn(featureId: string, signIn: SignInContribution): void {
  if (typeof signIn.provider !== "string" || signIn.provider.trim() === "") {
    throw new ShellError(
      `signIns.add: the feature "${featureId}" gives the sign-in ${JSON.stringify(signIn.id)} no provider. Name who the user signs in to, such as "Paperclip".`,
    );
  }
  const known: readonly string[] = focusedAppIds;
  for (const app of signIn.blockingFor) {
    if (!known.includes(app)) {
      throw new ShellError(
        `signIns.add: the feature "${featureId}" blocks the app ${JSON.stringify(app)}, which isn't one of the apps Halonic starts (${focusedAppIds.join(", ")}).`,
      );
    }
  }
}
