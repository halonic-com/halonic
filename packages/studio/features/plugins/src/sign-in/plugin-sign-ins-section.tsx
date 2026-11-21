import type { Plugin } from "@halonicjs/format";
import { Button, Callout, Spinner, StatusChip, useOpenExternal } from "@halonicjs/studio-kit";
import { type Ref, useCallback, useEffect, useId, useRef, useState } from "react";
import { messageOf } from "../message-of.ts";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";
import {
  NotTheSignInPageError,
  type SignInFacts,
  signInFacts,
  signInPage,
  tokenHostDiffers,
} from "./sign-in-facts.ts";
import {
  CANCEL,
  CLIENT_SECRET_NOT_SET,
  cancelFailed,
  outcomeLine,
  SETTINGS_NEEDED,
  SIGN_IN,
  SIGN_IN_AGAIN,
  SIGN_IN_CHANGED,
  SIGN_IN_NOT_FINISHED,
  SIGN_IN_UNAVAILABLE_HERE,
  SIGN_INS_HEADING,
  SIGN_OUT,
  SIGNED_IN,
  type SignInOutcome,
  signedOutNotConfirmed,
  signInNotStarted,
  signInPageNotApproved,
  signInsNotLoadedTitle,
  signOutFailed,
  tokenHostWarning,
  trustLine,
  waitingForBrowser,
} from "./sign-in-text.ts";

/** Where one sign-in stands, in the agent host's word (`IntegrationSignInState`). */
export type PluginSignInState = "signedIn" | "signedOut" | "approvalChanged" | "cannotSignIn";

/** One sign-in, as the agent host reports it (`IntegrationSignInStatus`). */
export interface PluginSignInStatus {
  readonly signIn: string;
  readonly state: PluginSignInState;
  readonly lastOutcome?: SignInOutcome | undefined;
}

/** How a sign-out ended (`IntegrationSignOutResult`). */
export type PluginSignOutResult =
  | { readonly kind: "notSignedIn" }
  | {
      readonly kind: "signedOut";
      readonly revoke: "revoked" | "notConfirmed" | "noRevokeUrl" | "skipped";
    };

/**
 * The app's way to a plugin's sign-ins: the agent host's sign-in routes. The
 * page never holds a code, a token or a client secret. The browser opens
 * through the kit's `openExternal`, as every outside page does.
 */
export interface PluginSignIns {
  status(plugin: string): Promise<readonly PluginSignInStatus[]>;
  /** Starts a sign-in and answers the address to open. Throws with the host's `kind` when it refuses. */
  start(plugin: string, signIn: string): Promise<string>;
  /** Drops the pending sign-in, so the browser's answer that still arrives is refused. */
  cancel(plugin: string, signIn: string): Promise<void>;
  signOut(plugin: string, signIn: string): Promise<PluginSignOutResult>;
}

/** The props of `PluginSignInsSection`. */
export interface PluginSignInsSectionProps {
  readonly plugin: Plugin;
  /** The plugin's settings now, for the sign-ins' hosts and client ID. */
  readonly settings: PluginSettingsReader;
  readonly signIns: PluginSignIns;
  /**
   * Set while the plugin is off: the host runs no sign-ins for it, so the
   * section shows what each sign-in would do and has no buttons.
   */
  readonly off?: { readonly reason: string } | undefined;
  /** On a phone or a served browser: no buttons, as for the rest of the page. */
  readonly viewOnly?: boolean;
  /**
   * Reads a sign-in's new line once through the window's announcer
   * (`announcer.announceState`). Without it nothing is read.
   */
  readonly announceState?: ((key: string, text: string) => void) | undefined;
}

/**
 * A plugin's sign-ins (HAL-984 design section 6, approved on HAL-8619): one
 * block each, with its purpose, the trust check line, the token host warning
 * when the hosts differ, and **Sign in**, **Signed in** with **Sign out**, or
 * **Sign in again** with the reason. While the browser sign-in is open the
 * block waits, with **Cancel**. After the browser sign-in, the person comes
 * back to Halonic, and the section reads where the sign-ins stand again when
 * the window gets focus. A plugin without sign-ins shows nothing.
 *
 * @example
 * <PluginSignInsSection plugin={manifest} settings={pluginService} signIns={hostSignIns} />
 */
export function PluginSignInsSection({
  plugin,
  settings,
  signIns,
  off,
  viewOnly = false,
  announceState,
}: PluginSignInsSectionProps) {
  const headingId = useId();
  const { facts, statuses, problem, reload } = useSignIns(plugin, settings, signIns, off);
  if (facts === undefined || facts.signIns.length === 0) return null;
  const blocks =
    facts.kind === "resolved"
      ? facts.signIns.map((each) => ({ signIn: each.signIn, purpose: each.purpose, facts: each }))
      : facts.signIns.map((each) => ({ ...each, facts: undefined }));
  const actions = off === undefined && !viewOnly;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-heading">
        {SIGN_INS_HEADING}
      </h2>
      {problem === undefined ? null : (
        <Callout tone="danger" title={signInsNotLoadedTitle(plugin.name)}>
          {problem}
        </Callout>
      )}
      <ul className="flex list-none flex-col gap-4">
        {blocks.map((each) => (
          <SignInBlock
            key={each.signIn}
            service={plugin.name}
            plugin={plugin.id}
            signIn={each.signIn}
            purpose={each.purpose}
            facts={each.facts}
            status={statuses?.find((status) => status.signIn === each.signIn)}
            signIns={signIns}
            actions={actions}
            onChanged={reload}
            announceState={announceState}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Reads the settings and where the sign-ins stand, and again whenever the
 * window gets focus: the person signs in in the browser and comes back.
 */
function useSignIns(
  plugin: Plugin,
  settings: PluginSettingsReader,
  signIns: PluginSignIns,
  off: { readonly reason: string } | undefined,
) {
  const [facts, setFacts] = useState<ReturnType<typeof signInFacts> | undefined>(undefined);
  const [statuses, setStatuses] = useState<readonly PluginSignInStatus[] | undefined>(undefined);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const running = off === undefined;

  const reload = useCallback(async () => {
    try {
      const values = await settings.settings(plugin);
      const read = signInFacts(plugin, values);
      setFacts(read);
      if (!running || read.signIns.length === 0) return;
      setStatuses(await signIns.status(plugin.id));
      setProblem(undefined);
    } catch (error) {
      setProblem(messageOf(error));
    }
  }, [plugin, settings, signIns, running]);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  return { facts, statuses, problem, reload };
}

/**
 * How long the host keeps a sign-in waiting for the browser (`pendingSignInLifetimeMs`, 10
 * minutes). After it the host refuses the browser's answer, so the block stops waiting.
 */
const browserWaitMs = 10 * 60 * 1000;

interface SignInBlockProps {
  readonly service: string;
  readonly plugin: string;
  readonly signIn: string;
  readonly purpose: string;
  /** `undefined` while a setting the sign-in reads is missing or wrong. */
  readonly facts: SignInFacts | undefined;
  readonly status: PluginSignInStatus | undefined;
  readonly signIns: PluginSignIns;
  readonly actions: boolean;
  readonly onChanged: () => Promise<void>;
  readonly announceState: ((key: string, text: string) => void) | undefined;
}

/**
 * One sign-in: what it does, where it stands, its one button and the line under it. Once the
 * browser opens, the block waits for it with **Cancel** in place of the button, until the host
 * reports the sign-in differently from when it opened, the person cancels, or the host's wait
 * ends. A sign-in that fails the same way twice in a row reads the same, so that wait ends only
 * by **Cancel** or the host's wait.
 */
function SignInBlock({
  service,
  plugin,
  signIn: name,
  purpose,
  facts,
  status,
  signIns,
  actions,
  onChanged,
  announceState,
}: SignInBlockProps) {
  const openExternal = useOpenExternal();
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | undefined>(undefined);
  // Set while the browser sign-in is open: where the sign-in stood when the browser opened.
  const [waiting, setWaiting] = useState<
    { readonly from: PluginSignInStatus | undefined } | undefined
  >(undefined);
  const block = useRef<HTMLLIElement>(null);
  const waitingRow = useRef<HTMLDivElement>(null);
  // The wait ended while the person was on its row, so focus goes to the button back in its place.
  const refocus = useRef(false);
  const state = facts === undefined ? "cannotSignIn" : status?.state;
  const announceKey = `sign-in:${plugin}:${name}`;

  // A sign-in the browser finished, or ended without a grant, is reported differently.
  useEffect(() => {
    if (waiting === undefined || sameStatus(waiting.from, status)) return;
    refocus.current = hasFocus(waitingRow.current);
    setWaiting(undefined);
  }, [waiting, status]);

  useEffect(() => {
    if (waiting === undefined) return;
    const timer = setTimeout(() => {
      refocus.current = hasFocus(waitingRow.current);
      setWaiting(undefined);
      setLine(SIGN_IN_NOT_FINISHED);
    }, browserWaitMs);
    return () => clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (waiting !== undefined || !refocus.current) return;
    refocus.current = false;
    block.current?.querySelector("button")?.focus();
  }, [waiting]);

  async function signIn() {
    // No button offers a sign-in without the facts; the check below needs them.
    if (facts === undefined) return;
    setBusy(true);
    setLine(undefined);
    try {
      // The browser has to open its tab inside the click, so the address is handed over as a
      // promise. It opens only the approved sign-in page (`signInPage`).
      const address = signIns.start(plugin, name).then((answered) => signInPage(answered, facts));
      await openExternal(address);
      setWaiting({ from: status });
      announceState?.(announceKey, waitingForBrowser(service));
    } catch (error) {
      setLine(startFailedLine(error));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setLine(undefined);
    try {
      await signIns.cancel(plugin, name);
      refocus.current = hasFocus(waitingRow.current);
      setWaiting(undefined);
    } catch (error) {
      setLine(cancelFailed(messageOf(error)));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setLine(undefined);
    try {
      const result = await signIns.signOut(plugin, name);
      const confirmed =
        result.kind === "notSignedIn" || result.revoke === "revoked" || result.revoke === "skipped";
      if (!confirmed) setLine(signedOutNotConfirmed(service));
      await onChanged();
    } catch (error) {
      setLine(signOutFailed(messageOf(error)));
    } finally {
      setBusy(false);
    }
  }

  const outcome = outcomeShown(service, status);
  // While it waits, how an earlier sign-in ended is no longer news.
  const shown = line ?? (waiting === undefined ? outcome : undefined);
  // Until the host answered where the sign-in stands, the line isn't known yet.
  const known = line !== undefined || status !== undefined;
  useAnnounceLineChanges(announceKey, known, shown, announceState);

  return (
    <li ref={block} className="flex flex-col gap-2">
      <p className="text-body-strong wrap-anywhere">{purpose}</p>
      {facts === undefined ? null : (
        <>
          <p className="text-small text-fg-muted wrap-anywhere">{trustLine(service, facts)}</p>
          {tokenHostDiffers(facts) ? (
            <Callout tone="attention">{tokenHostWarning(facts)}</Callout>
          ) : null}
        </>
      )}
      {waiting !== undefined && actions ? (
        <WaitingRow ref={waitingRow} service={service} busy={busy} onCancel={() => void cancel()} />
      ) : (
        <StateRow
          state={state}
          busy={busy}
          actions={actions}
          onSignIn={signIn}
          onSignOut={signOut}
        />
      )}
      {shown === undefined ? null : (
        // Plain text: a status region made together with its text is often skipped, so the
        // announcer reads a new line (SN1).
        <p className="text-small text-fg-muted wrap-anywhere">{shown}</p>
      )}
    </li>
  );
}

/**
 * Reads the line under a sign-in once when it changes. The first line known,
 * when the page opens, is not a change.
 */
function useAnnounceLineChanges(
  key: string,
  known: boolean,
  shown: string | undefined,
  announceState: ((key: string, text: string) => void) | undefined,
): void {
  const previous = useRef<{ readonly shown: string | undefined } | undefined>(undefined);
  useEffect(() => {
    if (!known) return;
    const changed = previous.current !== undefined && previous.current.shown !== shown;
    if (changed && shown !== undefined) announceState?.(key, shown);
    previous.current = { shown };
  }, [key, known, shown, announceState]);
}

interface WaitingRowProps {
  readonly ref: Ref<HTMLDivElement>;
  readonly service: string;
  readonly busy: boolean;
  readonly onCancel: () => void;
}

/**
 * The browser sign-in is open: a spinner, "Waiting for Acme… Finish in your browser." and
 * **Cancel**, as the Google setup waits. The window's announcer reads the line once when the wait
 * starts, so it is plain text.
 */
function WaitingRow({ ref, service, busy, onCancel }: WaitingRowProps) {
  return (
    <div ref={ref} className="flex flex-wrap items-center gap-2">
      <span className="size-4 text-fg-muted">
        <Spinner />
      </span>
      <p className="text-small text-fg-muted wrap-anywhere">{waitingForBrowser(service)}</p>
      <Button variant="ghost" size="sm" busy={busy} onClick={onCancel}>
        {CANCEL}
      </Button>
    </div>
  );
}

interface StateRowProps {
  readonly state: PluginSignInState | undefined;
  readonly busy: boolean;
  readonly actions: boolean;
  readonly onSignIn: () => Promise<void>;
  readonly onSignOut: () => Promise<void>;
}

/**
 * Where the sign-in stands and its one button. Without actions (the plugin is
 * off, or the page is view only) only the words show.
 */
function StateRow({ state, busy, actions, onSignIn, onSignOut }: StateRowProps) {
  switch (state) {
    case undefined:
      return null;
    case "cannotSignIn":
      return <p className="text-small text-fg-muted">{SETTINGS_NEEDED}</p>;
    case "signedIn":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="success" dot>
            {SIGNED_IN}
          </StatusChip>
          {actions ? (
            <Button variant="secondary" size="sm" busy={busy} onClick={() => void onSignOut()}>
              {SIGN_OUT}
            </Button>
          ) : null}
        </div>
      );
    case "approvalChanged":
      return (
        <div className="flex flex-col items-start gap-2">
          <p className="text-small text-fg-muted">{SIGN_IN_CHANGED}</p>
          {actions ? (
            <Button variant="primary" size="sm" busy={busy} onClick={() => void onSignIn()}>
              {SIGN_IN_AGAIN}
            </Button>
          ) : null}
        </div>
      );
    case "signedOut":
      return actions ? (
        <div>
          <Button variant="primary" size="sm" busy={busy} onClick={() => void onSignIn()}>
            {SIGN_IN}
          </Button>
        </div>
      ) : null;
  }
}

/**
 * How the last sign-in ended, unless the state already says it: a sign-in
 * that ended because the sign-in changed shows **Sign in again** with that
 * same reason.
 */
function outcomeShown(service: string, status: PluginSignInStatus | undefined): string | undefined {
  const lastOutcome = status?.lastOutcome;
  if (lastOutcome === undefined) return undefined;
  if (status?.state === "approvalChanged" && lastOutcome.kind === "signInChanged") return undefined;
  return outcomeLine(service, lastOutcome);
}

/** Whether the person is on something inside `element`. */
function hasFocus(element: HTMLElement | null): boolean {
  return element?.contains(document.activeElement) ?? false;
}

/** Whether the host reports a sign-in as it did before: the same state and the same last outcome. */
function sameStatus(
  before: PluginSignInStatus | undefined,
  now: PluginSignInStatus | undefined,
): boolean {
  return (
    before?.state === now?.state &&
    JSON.stringify(before?.lastOutcome) === JSON.stringify(now?.lastOutcome)
  );
}

/** The line when **Sign in** couldn't start: the host's refusal in words, or the reason. */
function startFailedLine(error: unknown): string {
  if (error instanceof NotTheSignInPageError) return signInPageNotApproved(error.approvedHost);
  const kind =
    typeof error === "object" && error !== null && "kind" in error ? error.kind : undefined;
  switch (kind) {
    case "settings_invalid":
      return SETTINGS_NEEDED;
    case "client_secret_missing":
      return CLIENT_SECRET_NOT_SET;
    case "callback_unavailable":
      return SIGN_IN_UNAVAILABLE_HERE;
    default:
      return signInNotStarted(messageOf(error));
  }
}
