import { useRef } from "react";
import { Button } from "../button/button.tsx";
import { LetterTile } from "../letter-tile/letter-tile.tsx";
import { BlockingDialog } from "./blocking-dialog.tsx";

/** Where a sign-in the user started is. */
export type SignInRowProgress =
  | { readonly kind: "idle" }
  | { readonly kind: "waiting"; readonly phrase: string | undefined }
  | { readonly kind: "failed" };

/** One needed sign-in, as the prompt draws it. */
export interface SignInRowItem {
  /** Unique in the prompt. */
  readonly key: string;
  /** Who the user signs in to, such as "Paperclip". */
  readonly provider: string;
  /** The provider's logo, an image's URL; without one, the provider's first letter. */
  readonly logo: string | undefined;
  /** What it is for, as in "Sign in to Google to use {purpose}." */
  readonly purpose: string;
  /** Which account or connection, such as "Acme team". */
  readonly name: string;
  readonly progress: SignInRowProgress;
}

/** The props of `SignInModal`. */
export interface SignInModalProps {
  /** The app that can't work, as in "Inbox needs your Paperclip sign-in to work." */
  readonly app: string;
  /** The blocking sign-ins, at least one, in the order to show. */
  readonly signIns: readonly SignInRowItem[];
  readonly onSignIn: (key: string) => void;
}

/**
 * The modal for the sign-ins an app can't work without (`kit.sign-in-prompt`): a
 * {@link BlockingDialog} with one row per sign-in, each with its logo and **Sign in** button.
 */
export function SignInModal({ app, signIns, onSignIn }: SignInModalProps) {
  const list = useRef<HTMLDivElement>(null);
  const [first] = signIns;
  const single = signIns.length === 1 && first !== undefined;
  const title = single ? `Sign in to ${first.provider}` : "Sign in to keep working";
  const description = single
    ? `${app} needs your ${first.provider} sign-in to work.`
    : `${app} needs these sign-ins to work.`;
  return (
    <BlockingDialog
      title={title}
      description={description}
      initialFocus={() => list.current?.querySelector("button") ?? null}
    >
      <div ref={list} className="flex flex-col gap-3">
        {signIns.map((signIn) => (
          <SignInRow key={signIn.key} signIn={signIn} label={signIn.name} onSignIn={onSignIn} />
        ))}
      </div>
    </BlockingDialog>
  );
}

/** The props of `SignInBand`. */
export interface SignInBandProps {
  /** The sign-ins that don't block the app, in the order to show. */
  readonly signIns: readonly SignInRowItem[];
  /** Whether a sign-in's state couldn't be read. */
  readonly unreadable: boolean;
  readonly onSignIn: (key: string) => void;
  /** Reads the sign-ins again. */
  readonly onTryAgain: () => void;
}

/**
 * The band under the title bar for sign-ins that don't block the app (`kit.sign-in-prompt`). It
 * has no dismiss button: it goes away once each sign-in is done. It draws nothing while there is
 * nothing to say.
 */
export function SignInBand({ signIns, unreadable, onSignIn, onTryAgain }: SignInBandProps) {
  if (signIns.length === 0 && !unreadable) {
    return null;
  }
  return (
    <section
      aria-label="Sign-ins"
      className="flex flex-col gap-2 border-b border-border bg-surface-muted px-4 py-2"
    >
      {signIns.map((signIn) => (
        <SignInRow
          key={signIn.key}
          signIn={signIn}
          label={`Sign in to ${signIn.provider} to use ${signIn.purpose}.`}
          onSignIn={onSignIn}
        />
      ))}
      {unreadable ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-body">Couldn't check your sign-ins.</p>
          <Button size="sm" onClick={onTryAgain}>
            Try again
          </Button>
        </div>
      ) : null}
    </section>
  );
}

interface SignInRowProps {
  readonly signIn: SignInRowItem;
  readonly label: string;
  readonly onSignIn: (key: string) => void;
}

function SignInRow({ signIn, label, onSignIn }: SignInRowProps) {
  const waiting = signIn.progress.kind === "waiting";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {signIn.logo === undefined ? (
          <LetterTile name={signIn.provider} />
        ) : (
          <img src={signIn.logo} alt={signIn.provider} className="size-6 shrink-0" />
        )}
        <p className="min-w-0 flex-1 text-body wrap-break-word">{label}</p>
        <Button
          size="sm"
          variant="primary"
          busy={waiting}
          busyLabel="Waiting…"
          name={`Sign in: ${signIn.provider}, ${signIn.name}`}
          onClick={() => onSignIn(signIn.key)}
        >
          Sign in
        </Button>
      </div>
      <ProgressLine progress={signIn.progress} />
    </div>
  );
}

function ProgressLine({ progress }: { readonly progress: SignInRowProgress }) {
  if (progress.kind === "waiting") {
    const check = progress.phrase === undefined ? "" : ` Check that it shows: ${progress.phrase}`;
    return (
      <p role="status" className="text-small text-fg-muted">
        {`Approve the sign-in in your browser.${check}`}
      </p>
    );
  }
  if (progress.kind === "failed") {
    return (
      <p role="alert" className="text-small text-danger">
        That sign-in didn't finish. Try again.
      </p>
    );
  }
  return null;
}
