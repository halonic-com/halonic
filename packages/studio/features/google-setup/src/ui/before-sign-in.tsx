import type { SignInStep } from "@halonicjs/google-setup";
import { Callout, CopyButton } from "@halonicjs/studio-kit";
import { adminNote } from "../admin-note.ts";
import { listNames } from "./account-labels.ts";

/** What the text above the sign-in button needs to know that the step doesn't carry. */
export interface BeforeSignInProps {
  readonly step: SignInStep;
  /** The app name chosen in step 3, which is what Google's "Go to …" link says. */
  readonly appName: string | undefined;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly serviceName: (id: string) => string;
}

/**
 * What a person reads before they press **Sign in with Google** (design 3.4): for a personal
 * account a preview of Google's warning and how to get past it, drawn as a Studio callout rather
 * than as a picture of Google's page; for a Workspace account a note that the admin may have to
 * allow the app, with the note to send. The step says which one, from the account type.
 */
export function BeforeSignIn(props: BeforeSignInProps) {
  return props.step.beforeSignIn === "warning-preview" ? (
    <WarningPreview {...props} />
  ) : (
    <AdminNote {...props} />
  );
}

function WarningPreview({ step, appName, serviceName }: BeforeSignInProps) {
  const services = listNames(step.checks.map((check) => serviceName(check.service)));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body">
        Google will show a warning first, because your app is yours and Google hasn't reviewed it:
      </p>
      <Callout tone="info" title={`"Google hasn't verified this app"`}>
        <ol className="flex list-decimal flex-col gap-1 pl-5">
          <li>Click "Advanced"</li>
          <li>Click "Go to {appName ?? "your app"} (unsafe)"</li>
          <li>Tick the boxes for {services}, then "Continue"</li>
        </ol>
      </Callout>
      <p className="text-small text-fg-muted">
        The name in step 2 is the app name you chose in step 3. Google shows this warning for any
        app it hasn't reviewed.
      </p>
    </div>
  );
}

function AdminNote({ step, projectId, clientId, serviceName }: BeforeSignInProps) {
  const note = adminNote({ projectId, clientId, scopes: step.scopesToGrant, serviceName });
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body">
        Your admin may have to allow this app. If Google says it is blocked, send them this note:
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <p className="min-w-0 flex-1 text-small text-fg">{note}</p>
        <CopyButton text={note} label="Copy a note for your admin" />
      </div>
    </div>
  );
}
