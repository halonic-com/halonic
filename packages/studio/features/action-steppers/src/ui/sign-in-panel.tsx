import {
  Button,
  Callout,
  CodeDisplay,
  ExternalLink,
  Field,
  Input,
  SecretText,
} from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { StepperActions, StepperService, StepperSignIn } from "../stepper-view.ts";
import { missingPermissionText, signInWords } from "./stepper-words.ts";

/** Props for {@link SignInPanel}. */
export interface SignInPanelProps {
  readonly signIn: StepperSignIn;
  readonly saveToken: StepperActions["saveToken"];
}

/**
 * Sign-in for the request's service (`action-steppers.sign-in`): GitHub's device code to type on
 * GitHub's own page, or a field for a Cloudflare API token with the permissions it needs. The
 * token goes to the desktop shell as a {@link SecretText}, so it never turns into text here.
 */
export function SignInPanel({ signIn, saveToken }: SignInPanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {signIn.service === "github" ? (
        <>
          <h3 id={headingId} className="text-body-strong text-fg">
            {signInWords.githubHeading}
          </h3>
          <p className="text-body text-fg">{signInWords.githubText}</p>
          <CodeDisplay code={signIn.code} group={4} size="md" label={signInWords.githubCode} />
          <p>
            <ExternalLink href={signIn.address}>{signInWords.githubOpen}</ExternalLink>
          </p>
          <p role="status" className="text-small text-fg-muted">
            {signInWords.githubWaiting}
          </p>
        </>
      ) : (
        <>
          <h3 id={headingId} className="text-body-strong text-fg">
            {signInWords.cloudflareHeading}
          </h3>
          <p className="text-body text-fg">{signInWords.cloudflareText}</p>
          <ul className="list-disc pl-5 text-body text-fg">
            {signIn.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
          <p>
            <ExternalLink href={signIn.tokenPage}>{signInWords.cloudflareOpen}</ExternalLink>
          </p>
          <TokenForm saveToken={saveToken} />
        </>
      )}
    </section>
  );
}

/**
 * The token field. What was typed lives only in the input until Save token. An empty field keeps
 * the button pressable and says what's missing (component specs 23 A1).
 */
function TokenForm({ saveToken }: { readonly saveToken: StepperActions["saveToken"] }) {
  const [typed, setTyped] = useState("");
  const [empty, setEmpty] = useState(false);
  const save = () => {
    const token = new SecretText(typed.trim());
    setEmpty(token.isEmpty);
    if (token.isEmpty) return;
    saveToken(token);
    setTyped("");
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Field
        label={signInWords.tokenLabel}
        hint={signInWords.kept}
        error={empty ? signInWords.tokenEmpty : null}
      >
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          mono
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" variant="primary">
          {signInWords.save}
        </Button>
      </div>
    </form>
  );
}

/** Props for {@link MissingPermission}. */
export interface MissingPermissionProps {
  readonly service: StepperService;
  readonly account: string | null;
  readonly permission: string;
  readonly signInAgain: StepperActions["signInAgain"];
}

/** The account the user signed in with lacks a permission the request needs: which one, by name. */
export function MissingPermission({
  service,
  account,
  permission,
  signInAgain,
}: MissingPermissionProps) {
  return (
    <Callout
      tone="attention"
      announce="polite"
      action={{
        label: signInWords.signInAgain,
        onClick: () => {
          signInAgain();
        },
      }}
    >
      {missingPermissionText(service, account, permission)}
    </Callout>
  );
}
