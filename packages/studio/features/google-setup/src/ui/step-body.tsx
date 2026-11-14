import type {
  AccountType,
  ApisStep,
  ConsentStep,
  ProjectStep,
  ScopesStep,
  SetupStep,
} from "@halonicjs/google-setup";
import {
  Button,
  Callout,
  Checkbox,
  Disclosure,
  ExternalLink,
  Field,
  Input,
  StatusChip,
  useOpenExternal,
} from "@halonicjs/studio-kit";
import { type ReactNode, useId } from "react";
import { listNames } from "./account-labels.ts";
import { ConsoleLink } from "./console-link.tsx";
import { CopyLine } from "./copy-line.tsx";
import { useNotAnswering } from "./not-answering.tsx";

/** Props for {@link StepBody}. */
export interface StepBodyProps {
  readonly step: SetupStep;
  /** Personal or Workspace, which decides what the scopes note may say. */
  readonly accountType: AccountType | null;
  /** The "In production" tick as saved. */
  readonly inProduction: boolean;
  /** The project ID as typed in step 1, and what is wrong with it, if anything. */
  readonly projectId: string;
  readonly projectIdError: string | null;
  readonly answering: boolean;
  /** A service's name from its id, for "Needed by …". Studio never knows the services itself. */
  readonly serviceName: (id: string) => string;
  readonly onProjectId: (text: string) => void;
  readonly onInProduction: (ticked: boolean) => void;
  /** Opens a finished step again, for the way back from "Internal isn't available?". */
  readonly onEditProject: () => void;
}

/**
 * What an open step shows under its one sentence: the actions to take in Google, with the
 * values to copy and the links, all from the step the generator made. Steps 6 and 7 have their
 * bodies in later pull requests (HAL-713, HAL-714).
 */
export function StepBody(props: StepBodyProps) {
  const { step } = props;
  switch (step.id) {
    case "project":
      return <ProjectBody {...props} step={step} />;
    case "apis":
      return <ApisBody step={step} serviceName={props.serviceName} />;
    case "consent":
      return <ConsentBody {...props} step={step} />;
    case "scopes":
      return <ScopesBody step={step} accountType={props.accountType} />;
    case "client":
      return <ClientBody step={step} />;
    case "credentials":
    case "sign-in":
      return null;
  }
}

function Actions({ children }: { readonly children: ReactNode }) {
  // Lettered, so an action is never "3" under a step that is itself number 3.
  return <ol className="flex list-[lower-alpha] flex-col gap-2 pl-5 text-body">{children}</ol>;
}

function ProjectBody({
  step,
  projectId,
  projectIdError,
  onProjectId,
}: StepBodyProps & { readonly step: ProjectStep }) {
  return (
    <div className="flex flex-col gap-3">
      <Actions>
        <li>
          Open the <ConsoleLink step={step} page="new-project" />.
        </li>
        <li className="flex flex-col gap-1">
          Name the project:
          <CopyLine step={step} id="project-name" />
        </li>
        {step.location === "inside-organisation" ? (
          <li>Set Location to your organisation.</li>
        ) : null}
        <li>Click "Create".</li>
      </Actions>
      <Field
        label="Project ID"
        hint="Optional. With it, the links below open in this project."
        error={projectIdError}
      >
        <Input value={projectId} onChange={(event) => onProjectId(event.target.value)} />
      </Field>
    </div>
  );
}

function ApisBody({
  step,
  serviceName,
}: {
  readonly step: ApisStep;
  readonly serviceName: (id: string) => string;
}) {
  const openExternal = useOpenExternal();
  const switchOnAll = step.switchOnAllUrl;
  return (
    <div className="flex flex-col gap-3">
      {switchOnAll === undefined ? null : (
        <div>
          <Button variant="secondary" onClick={() => void openExternal(switchOnAll)}>
            Switch on all ↗<span className="sr-only"> (opens in your browser)</span>
          </Button>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {step.apis.map((row) => (
          <li key={row.api} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-body-strong text-fg">{row.name}</span>
            <code className="text-small text-fg-muted">{row.api}</code>
            <span className="text-small text-fg-muted">
              Needed by {listNames(row.neededBy.map(serviceName))}
            </span>
            <ExternalLink href={row.enableUrl}>Enable</ExternalLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsentBody({
  step,
  inProduction,
  answering,
  onInProduction,
  onEditProject,
}: StepBodyProps & { readonly step: ConsentStep }) {
  const notAnswering = useNotAnswering();
  const reason = useId();
  const external = step.audience === "external";
  return (
    <div className="flex flex-col gap-3">
      <Actions>
        <li>
          Open the <ConsoleLink step={step} page="branding" /> and start the wizard.
        </li>
        <li className="flex flex-col gap-1">
          Give the app these values:
          <CopyLine step={step} id="app-name" />
          <CopyLine step={step} id="support-email" />
          <CopyLine step={step} id="contact-email" />
        </li>
        <li>
          Choose the audience "{external ? "External" : "Internal"}". Check it on the{" "}
          <ConsoleLink step={step} page="audience" />.
        </li>
        {external ? (
          <li>
            Then on "Audience", click "Publish app" and confirm. The status must say "In
            production".
          </li>
        ) : null}
      </Actions>
      {step.requiredTicks.includes("in-production") ? (
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={inProduction}
            onChange={onInProduction}
            unavailable={answering ? undefined : { reason }}
          >
            The status says "In production"
          </Checkbox>
          <p className="pl-6 text-small text-fg-muted">
            In "Testing", Google ends your sign-in after 7 days.
          </p>
          {answering ? null : (
            <p id={reason} className="pl-6 text-small text-fg-muted">
              {notAnswering}
            </p>
          )}
        </div>
      ) : null}
      {external ? null : (
        <Disclosure summary="Internal isn't available?">
          <div className="flex flex-col items-start gap-2 p-4 text-body">
            <p>
              Your project isn't in your organisation. Create a new project with Location set to
              your organisation (step 1), or ask your admin for permission to create projects.
            </p>
            <Button variant="ghost" size="sm" onClick={onEditProject}>
              Edit step 1
            </Button>
          </div>
        </Disclosure>
      )}
    </div>
  );
}

function ScopesBody({
  step,
  accountType,
}: {
  readonly step: ScopesStep;
  readonly accountType: AccountType | null;
}) {
  // A Workspace app set to Internal gets no Google warning, so the note is for personal accounts.
  const showNote = accountType === "personal" && step.scopes.some((row) => row.restricted);
  return (
    <div className="flex flex-col gap-3">
      <Actions>
        <li>
          Open the <ConsoleLink step={step} page="data-access" />.
        </li>
        <li>Click "Add or remove scopes", paste the line below into "Manually add scopes".</li>
        <li>Click "Add to table", then "Update", then "Save".</li>
      </Actions>
      <ul className="flex flex-col gap-2">
        {step.scopes.map((row) => (
          <li key={row.scope} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 break-all text-small text-fg">{row.scope}</code>
              {row.restricted ? <StatusChip tone="outline">Restricted</StatusChip> : null}
            </div>
            {row.neededBy.map((need) => (
              <span key={need.service} className="text-small text-fg-muted">
                {need.reason}
              </span>
            ))}
          </li>
        ))}
      </ul>
      <CopyLine step={step} id="all-scopes" />
      {showNote ? (
        <Callout tone="info">
          Some of these scopes are ones Google calls <em>restricted</em>. Your own app can use them
          without Google's review, but Google shows a warning when you sign in. Step 7 shows what to
          click.
        </Callout>
      ) : null}
    </div>
  );
}

function ClientBody({ step }: { readonly step: SetupStep }) {
  return (
    <div className="flex flex-col gap-3">
      <Callout tone="warning">
        Google shows the client secret only once, right after you click Create. Keep that window
        open and go on to step 6.
      </Callout>
      <Actions>
        <li>
          Open the <ConsoleLink step={step} page="create-client" />.
        </li>
        <li>Choose the application type "Desktop app".</li>
        <li className="flex flex-col gap-1">
          Name the client:
          <CopyLine step={step} id="client-name" />
        </li>
        <li>Click "Create".</li>
      </Actions>
    </div>
  );
}
