import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import { accountMenuWords } from "./account-menu-words.ts";

/** Props for {@link SignedOutPage}. */
export interface SignedOutPageProps {
  /** The product's name from the session, shown as text only. */
  readonly productName: string;
  /** **Sign in again**: goes to the computer's sign-in route. */
  readonly onSignIn: () => void;
}

/**
 * B4's signed-out page (`account-menu.sign-out`): "You've signed out of {Product}" and
 * **Sign in again**, over the whole window. It is a modal `dialog` filling the page, so nothing of
 * the Studio behind it can be reached, and Escape doesn't close it: there is no session to go
 * back to.
 *
 * @example
 * <SignedOutPage productName="Acme Agents" onSignIn={() => host.open(host.signInAddress)} />
 */
export function SignedOutPage({ productName, onSignIn }: SignedOutPageProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) {
      element.showModal();
    }
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onCancel={(event) => event.preventDefault()}
      className="m-0 flex h-dvh max-h-none w-dvw max-w-none items-center justify-center bg-surface p-4 text-fg"
    >
      <div className="flex w-full max-w-sm flex-col items-start gap-4 rounded-md border border-border bg-surface-raised p-6">
        <h1 id={headingId} className="text-title font-semibold">
          {accountMenuWords.signedOut(productName)}
        </h1>
        <Button variant="primary" onClick={onSignIn}>
          {accountMenuWords.signInAgain}
        </Button>
      </div>
    </dialog>
  );
}
