import { CopyButton } from "@halonicjs/studio-kit";

/** Props for {@link SignInElsewhere}. */
export interface SignInElsewhereProps {
  /** The connector's address, which the command signs in. */
  readonly email: string;
  /** Whether the host has `halonic google sign-in`, so the command can be shown. */
  readonly commandExists: boolean;
  /** Whether **Copy** is shown with the command. A phone shows the command as text only. */
  readonly copyable: boolean;
}

/**
 * What step 7 says where **Sign in with Google** can't run (design 3.5, item 10): on a phone, or
 * in a browser on another computer, since Google sends the sign-in back to the computer that runs
 * Halonic. The command is shown only when the host has it; until then the text ends after
 * "Finish this step there."
 */
export function SignInElsewhere({ email, commandExists, copyable }: SignInElsewhereProps) {
  const command = `halonic google sign-in ${email}`;
  const sentence =
    "Google sends the sign-in back to the computer running Halonic. Finish this step ";
  return (
    <div className="flex flex-wrap items-center gap-2 text-body">
      {commandExists ? (
        <>
          <p>
            {`${sentence}there, or run `}
            <code className="min-w-0 break-all text-fg">{command}</code> on it.
          </p>
          {copyable ? <CopyButton text={command} label="Copy the command" /> : null}
        </>
      ) : (
        <p>{`${sentence}there.`}</p>
      )}
    </div>
  );
}
