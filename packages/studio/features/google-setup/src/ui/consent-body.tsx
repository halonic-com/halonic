import type { ConsentStep, PersonalPublishing } from "@halonicjs/google-setup";
import { Button, Checkbox, Disclosure } from "@halonicjs/studio-kit";
import { type ReactNode, type RefObject, useId, useLayoutEffect, useRef } from "react";
import { ConsoleLink } from "./console-link.tsx";
import { CopyLine } from "./copy-line.tsx";
import { useNotAnswering } from "./not-answering.tsx";

/** Props for {@link ConsentBody}. */
export interface ConsentBodyProps {
  readonly step: ConsentStep;
  /** Step 3's required tick as saved: the test user, or "In production". */
  readonly ticked: boolean;
  readonly answering: boolean;
  readonly onTick: (ticked: boolean) => void;
  /** **Publish with my own pages** and **Stay in Testing instead**. */
  readonly onPublishing: (publishing: PersonalPublishing) => void;
  /** Opens step 1 again, for the way back from "Internal isn't available?". */
  readonly onEditProject: () => void;
}

/** The lettered actions of a step, so an action is never "3" under a step that is itself number 3. */
export function Actions({
  start,
  children,
}: {
  readonly start?: number;
  readonly children: ReactNode;
}) {
  return (
    <ol start={start} className="flex list-[lower-alpha] flex-col gap-2 pl-5 text-body">
      {children}
    </ol>
  );
}

/** The address to add under Test users: the account's own, from the step's copy values. */
function testUser(step: ConsentStep): string {
  return step.copyValues.find((value) => value.id === "test-user")?.value ?? "";
}

/**
 * Step 3, the consent screen (design 3.2). A Workspace app is Internal. A personal app stays in
 * *Testing* with the account added as a test user, unless the user publishes it with their own
 * pages; a second account on a shared app in *Testing* only adds itself as a test user (3.6).
 */
export function ConsentBody(props: ConsentBodyProps) {
  const { step } = props;
  const firstNewPart = useFocusOnPublishing(step.publishing);
  if (step.publishing === null) return <InternalConsent {...props} />;
  if (step.parts === "test-user-only") {
    return (
      <div className="flex flex-col gap-3">
        <Actions start={3}>
          <TestUserPart step={step} />
        </Actions>
        <RequiredTick {...props} />
      </div>
    );
  }
  const testing = step.publishing === "testing";
  return (
    <div className="flex flex-col gap-3">
      <Actions>
        <WizardParts step={step} external />
        {testing ? (
          <TestUserPart step={step} partRef={firstNewPart} />
        ) : (
          <PublishParts step={step} partRef={firstNewPart} />
        )}
      </Actions>
      <RequiredTick {...props} />
      {testing ? (
        <Disclosure summary="Why not publish?">
          <WhyNotPublish onPublish={() => props.onPublishing("production")} />
        </Disclosure>
      ) : (
        <div>
          <Button variant="ghost" size="sm" onClick={() => props.onPublishing("testing")}>
            Stay in Testing instead
          </Button>
        </div>
      )}
    </div>
  );
}

/** Parts a and b: the "Get started" wizard and the values it asks for. */
function WizardParts({
  step,
  external,
}: {
  readonly step: ConsentStep;
  readonly external: boolean;
}) {
  return (
    <>
      <li>
        Open the <ConsoleLink step={step} page="branding" /> and start the wizard.
      </li>
      <li className="flex flex-col gap-1">
        Give the app these values:
        <CopyLine step={step} id="app-name" />
        <CopyLine step={step} id="support-email" />
        <CopyLine step={step} id="contact-email" />
        {external ? <span>Choose the audience "External".</span> : null}
      </li>
    </>
  );
}

/**
 * The part to focus once a publishing choice is saved: the pressed button (**Publish with my own
 * pages**, **Stay in Testing instead**, or the header's **Why?**) goes away with the parts it
 * swapped, so focus moves to the first new part instead of falling to the page. A layout effect,
 * so it runs before the header's own fallback. A failed save changes nothing, and focus stays on
 * the button; a change made elsewhere, while focus is on something still there, doesn't move it.
 */
function useFocusOnPublishing(
  publishing: PersonalPublishing | null,
): RefObject<HTMLLIElement | null> {
  const part = useRef<HTMLLIElement>(null);
  const before = useRef(publishing);
  useLayoutEffect(() => {
    if (before.current === publishing) return;
    before.current = publishing;
    if (document.activeElement === null || document.activeElement === document.body) {
      part.current?.focus();
    }
  }, [publishing]);
  return part;
}

/** Part c in *Testing*: the account's own address under Test users. */
function TestUserPart({
  step,
  partRef,
}: {
  readonly step: ConsentStep;
  readonly partRef?: RefObject<HTMLLIElement | null>;
}) {
  return (
    <li
      ref={partRef}
      tabIndex={partRef === undefined ? undefined : -1}
      className="flex flex-col gap-1"
    >
      <span>
        On "Audience", under "Test users", click "Add users", add your address and click "Save".{" "}
        <ConsoleLink step={step} page="audience" />
      </span>
      <CopyLine step={step} id="test-user" />
      <span className="text-fg-muted">
        The status stays "Testing". That's expected: "Publish app" stays greyed out until an app has
        a home page and a privacy policy.
      </span>
    </li>
  );
}

/** Parts c and d with the user's own pages: Branding, then **Publish app**. Nothing to copy. */
function PublishParts({
  step,
  partRef,
}: {
  readonly step: ConsentStep;
  readonly partRef: RefObject<HTMLLIElement | null>;
}) {
  const rows = [
    ["Application home page", "a page on your site"],
    ["Application privacy policy link", "a page on your site"],
    ["Authorized domains", "your site's domain"],
  ] as const;
  return (
    <>
      <li ref={partRef} tabIndex={-1} className="flex flex-col gap-1">
        <span>
          On "Branding", fill in, then click "Save". <ConsoleLink step={step} page="branding" />
        </span>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([field, value]) => (
            <div key={field} className="contents">
              <dt>{field}</dt>
              <dd className="text-fg-muted">{value}</dd>
            </div>
          ))}
        </dl>
      </li>
      <li>
        On "Audience", click "Publish app" and confirm. <ConsoleLink step={step} page="audience" />
      </li>
    </>
  );
}

/** The tick step 3 needs before **Done, next**: the test user listed, or "In production". */
function RequiredTick({ step, ticked, answering, onTick }: ConsentBodyProps) {
  const notAnswering = useNotAnswering();
  const reason = useId();
  const testing = step.publishing === "testing";
  return (
    <div className="flex flex-col gap-1">
      <Checkbox checked={ticked} onChange={onTick} unavailable={answering ? undefined : { reason }}>
        {testing
          ? `${testUser(step)} is listed under "Test users"`
          : `The status says "In production"`}
      </Checkbox>
      {testing ? (
        <p className="pl-6 text-small text-fg-muted">
          Without it, Google blocks your sign-in in step 6.
        </p>
      ) : null}
      {answering ? null : (
        <p id={reason} className="pl-6 text-small text-fg-muted">
          {notAnswering}
        </p>
      )}
    </div>
  );
}

/**
 * "Why not publish?" (design 3.2): why Google ends the sign-in every week, and the way out for
 * someone with a website. Step 3 folds it, and the header's **Why?** opens the same text.
 */
export function WhyNotPublish({ onPublish }: { readonly onPublish: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 p-4 text-body">
      <p>
        <strong>Why does Google end the sign-in every week?</strong> Your app is in <em>Testing</em>
        . For apps in Testing, Google ends every sign-in after 7 days. To leave Testing, Google
        wants your app to have a home page and a privacy policy on the web, even if you're its only
        user.
      </p>
      <p>
        <strong>Have a website?</strong> You can publish your app with your own pages, and the
        weekly sign-in goes away.
      </p>
      <Button variant="ghost" size="sm" onClick={onPublish}>
        Publish with my own pages<span aria-hidden="true"> ▸</span>
      </Button>
    </div>
  );
}

/** A Workspace app: audience Internal, nothing to publish, and the way back to step 1. */
function InternalConsent({ step, onEditProject }: ConsentBodyProps) {
  return (
    <div className="flex flex-col gap-3">
      <Actions>
        <WizardParts step={step} external={false} />
        <li>
          Choose the audience "Internal". Check it on the{" "}
          <ConsoleLink step={step} page="audience" />.
        </li>
      </Actions>
      <Disclosure summary="Internal isn't available?">
        <div className="flex flex-col items-start gap-2 p-4 text-body">
          <p>
            Your project isn't in your organisation. Create a new project with Location set to your
            organisation (step 1), or ask your admin for permission to create projects.
          </p>
          <Button variant="ghost" size="sm" onClick={onEditProject}>
            Edit step 1
          </Button>
        </div>
      </Disclosure>
    </div>
  );
}
