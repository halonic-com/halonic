import type { SignInEnding } from "@halonicjs/google-setup";
import { Button, Callout, CopyButton } from "@halonicjs/studio-kit";

/** Props for {@link SignInEnded}. */
export interface SignInEndedProps {
  /** How the last sign-in ended without signing anyone in, from the setup record. `null` for none or since cleared. */
  readonly ending: SignInEnding | null;
  /** The note for the admin, for the row about an admin block. */
  readonly adminNote: string;
  /** Opens step 6, for a client secret Google refused. */
  readonly onOpenSecretStep: () => void;
}

/**
 * The note for a sign-in that came back to Halonic without signing anyone in (design 5.1): the
 * person cancelled on Google's page, Google refused the client secret, or the organisation's admin
 * hasn't allowed the app. Each says what happened and gives one next step. "You cancelled" is
 * worded apart from the Testing row of the folded error list: that one stops on Google's own 403
 * page, this one comes back with the person's choice. **Sign in with Google**, below, is the way
 * on for the first and the last.
 */
export function SignInEnded({ ending, adminNote, onOpenSecretStep }: SignInEndedProps) {
  switch (ending) {
    case null:
      return null;
    case "cancelled":
      return <Callout tone="info">You cancelled the sign-in. Nothing was saved.</Callout>;
    case "secretRefused":
      return (
        <Callout tone="attention">
          <span className="flex flex-col items-start gap-1">
            Google didn't accept the client secret. Paste it again from your client's page, then
            sign in again.
            <Button variant="ghost" size="sm" onClick={onOpenSecretStep}>
              Open step 6
            </Button>
          </span>
        </Callout>
      );
    case "adminBlocked":
      return (
        <Callout tone="attention">
          <span className="flex flex-col items-start gap-1">
            Your organisation's admin hasn't allowed this app yet. This is set by your admin, not by
            Halonic.
            <CopyButton text={adminNote} label="Copy a note for your admin" />
          </span>
        </Callout>
      );
    default:
      ending satisfies never;
      return null;
  }
}
