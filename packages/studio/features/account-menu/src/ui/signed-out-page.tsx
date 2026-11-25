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
 * **Sign in again**, in one card over the whole window, with no app parts, as Noah drew it on
 * HAL-18213. It is a modal `dialog` filling the page, so nothing of the Studio behind it can be
 * reached, and Escape doesn't close it: there is no session to go back to. It never sends the
 * browser to sign in by itself.
 *
 * @example
 * <SignedOutPage productName="Acme Agents" onSignIn={() => host.open(host.signInAddress)} />
 */
export function SignedOutPage({ productName, onSignIn }: SignedOutPageProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) {
      element.showModal();
    }
    // The heading, not the button, takes the focus, so the page is read before anything is done.
    heading.current?.focus();
  }, []);
  useKeptTitle(accountMenuWords.signedOutTitle(productName));
  return (
    <dialog
      ref={dialog}
      aria-labelledby={headingId}
      onCancel={(event) => event.preventDefault()}
      className="m-0 flex h-dvh max-h-none w-dvw max-w-none items-center justify-center bg-canvas p-4 text-fg"
    >
      <div className="flex w-full max-w-100 flex-col items-start gap-6 rounded-md border border-border bg-surface p-8 phone:items-stretch phone:p-6">
        <h1 ref={heading} id={headingId} tabIndex={-1} className="text-title">
          {accountMenuWords.signedOut(productName)}
        </h1>
        <Button variant="primary" onClick={onSignIn}>
          {accountMenuWords.signInAgain}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * Sets the page's title and puts it back whenever something else changes it: the window still
 * names its active page behind the signed-out page, for instance after a resize.
 */
function useKeptTitle(title: string): void {
  useEffect(() => {
    const keep = () => {
      if (document.title !== title) document.title = title;
    };
    keep();
    const observer = new MutationObserver(keep);
    observer.observe(document.head, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [title]);
}
