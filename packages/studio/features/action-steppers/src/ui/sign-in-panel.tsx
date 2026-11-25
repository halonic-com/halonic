import { Button, Callout, CodeDisplay } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { StepperActions, StepperService, StepperSignIn } from "../stepper-view.ts";
import { focusMarks } from "./stepper-changes.ts";
import { missingPermissionText, signInWords } from "./stepper-words.ts";

/** Props for {@link SignInPanel}. */
export interface SignInPanelProps {
  readonly signIn: StepperSignIn;
  readonly start: StepperActions["signIn"];
}

/**
 * Sign-in for the request's service (`action-steppers.sign-in`). GitHub's device flow starts only
 * from the user's click; the shell then opens GitHub's page and the code shows here. A Cloudflare
 * token goes into the shell's native dialog, never into the page (HAL-17491 3.1, 3.2).
 */
export function SignInPanel({ signIn, start }: SignInPanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-body-strong text-fg">
        {signIn.service === "github" ? signInWords.githubHeading : signInWords.cloudflareHeading}
      </h3>
      {signIn.service === "github" ? (
        <GitHubSignIn code={signIn.code} start={start} />
      ) : (
        <>
          <p className="text-body text-fg">{signInWords.cloudflareText}</p>
          <ul className="list-disc pl-5 text-body text-fg">
            {signIn.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
          <p className="text-small text-fg-muted">{signInWords.kept}</p>
          <div>
            <Button variant="primary" onClick={start}>
              {signInWords.cloudflarePaste}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function GitHubSignIn({
  code,
  start,
}: {
  readonly code: string | null;
  readonly start: StepperActions["signIn"];
}) {
  if (code === null) {
    return (
      <div>
        <Button variant="primary" onClick={start}>
          {signInWords.githubStart}
        </Button>
      </div>
    );
  }
  return (
    <>
      <p className="text-body text-fg">{signInWords.githubText}</p>
      {/* Focus comes here from Sign in to GitHub, which the code replaces. */}
      <div data-focus={focusMarks.signInCode} tabIndex={-1} className="focus-ring self-start">
        <CodeDisplay code={code} group={4} size="md" label={signInWords.githubCode} />
      </div>
      <p className="text-small text-fg-muted">{signInWords.githubWaiting}</p>
    </>
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
