import type { Plugin } from "@halonicjs/format";
import { type ButtonSize, Callout, useOpenSignIn, usePresentation } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { messageOf } from "../message-of.ts";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";
import {
  NotTheSignInPageError,
  type SignInFacts,
  signInFacts,
  signInPage,
  tokenHostDiffers,
} from "./sign-in-facts.ts";
import { StateRow, WaitingRow } from "./sign-in-rows.tsx";
import {
  CLIENT_SECRET_NOT_SET,
  cancelFailed,
  outcomeLine,
  SETTINGS_NEEDED,
  SIGN_IN_NOT_FINISHED,
  SIGN_IN_UNAVAILABLE_HERE,
  SIGN_INS_HEADING,
  type SignInOutcome,
  signedOutNotConfirmed,
  signedOutOf,
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
  /** How many sign-ins of this one have ended since the host started; new with every outcome. */
  readonly outcomeCount?: number | undefined;
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
 * through the kit's `openSignIn` (`kit.open-sign-in`), as every sign-in page does.
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
 * block waits, with **Open again** and **Cancel**. After the browser sign-in, the person comes
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
 * browser opens, the block waits for it with **Open again** and **Cancel** in place of the button,
 * until the host reports the sign-in differently from when it opened, the person cancels, or the
 * host's wait ends. Every outcome counts up the host's `outcomeCount`, so a sign-in that ends the
 * same way twice in a row ends the wait too. Focus follows the person: onto **Cancel** when the
 * wait starts from the block's button, and back to the block's button when the wait ends while
 * they were on its row (C569).
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
  const openSignIn = useOpenSignIn();
  // On a phone the block's buttons are touch buttons, as the 44px rule asks (C569).
  const buttonSize: ButtonSize = usePresentation() === "phone" ? "touch" : "sm";
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<ActionLine | undefined>(undefined);
  // Set while the browser sign-in is open: where the sign-in stood when the browser opened, and
  // the page it opened. **Open again** opens that same page: starting another sign-in would make
  // the first tab's answer fail. The page is never shown, only opened.
  const [waiting, setWaiting] = useState<
    { readonly from: PluginSignInStatus | undefined; readonly page: string } | undefined
  >(undefined);
  const block = useRef<HTMLLIElement>(null);
  const waitingRow = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  // The person was on the row that the wait swaps, so focus goes to the button in its place.
  const refocus = useRef(false);
  // The same after a sign-out: the row swaps Sign out for Sign in (SI1).
  const refocusAfterSignOut = useRef(false);
  const state = facts === undefined ? "cannotSignIn" : status?.state;
  const announceKey = `sign-in:${plugin}:${name}`;
  // An action's line is about the state it was written for; once the host reports another state,
  // it is old news, also when the state changed without an action (SI2).
  const lineNow = line !== undefined && line.state === state ? line.text : undefined;

  useEffect(() => {
    setLine((current) => (current?.state === state ? current : undefined));
  }, [state]);

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
      setLine({ text: SIGN_IN_NOT_FINISHED, state: waiting.from?.state });
    }, browserWaitMs);
    return () => clearTimeout(timer);
  }, [waiting]);

  // When the wait starts, focus goes to Cancel (C569); when it ends, to the state's button.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    if (waiting === undefined) block.current?.querySelector("button")?.focus();
    else cancelButton.current?.focus();
  }, [waiting]);

  useEffect(() => {
    if (!refocusAfterSignOut.current || state === "signedIn") return;
    refocusAfterSignOut.current = false;
    block.current?.querySelector("button")?.focus();
  }, [state]);

  async function signIn() {
    // No button offers a sign-in without the facts; the check below needs them.
    if (facts === undefined) return;
    setBusy(true);
    setLine(undefined);
    try {
      // The browser has to open its tab inside the click, so the address is handed over as a
      // promise. It opens only the approved sign-in page (`signInPage`).
      const address = signIns.start(plugin, name).then((answered) => signInPage(answered, facts));
      await openSignIn(address, `https://${facts.authorizeHost}`);
      const page = await address;
      refocus.current = hasFocus(block.current);
      setWaiting({ from: status, page });
      announceState?.(announceKey, waitingForBrowser(service));
    } catch (error) {
      setLine({ text: startFailedLine(error), state });
    } finally {
      setBusy(false);
    }
  }

  function openAgain() {
    if (waiting === undefined || facts === undefined) return;
    // For a page already known the kit's `openSignIn` never rejects: the shell reports its own
    // errors, such as a system browser that didn't start.
    void openSignIn(waiting.page, `https://${facts.authorizeHost}`);
  }

  async function cancel() {
    setBusy(true);
    setLine(undefined);
    try {
      await signIns.cancel(plugin, name);
      refocus.current = hasFocus(waitingRow.current);
      setWaiting(undefined);
      // The browser may have finished just before Cancel, so read where the sign-in stands now
      // rather than when the window next gets focus.
      await onChanged();
    } catch (error) {
      setLine({ text: cancelFailed(messageOf(error)), state });
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
      refocusAfterSignOut.current = hasFocus(block.current);
      if (confirmed) announceState?.(announceKey, signedOutOf(service));
      else setLine({ text: signedOutNotConfirmed(), state: "signedOut" });
      await onChanged();
    } catch (error) {
      setLine({ text: signOutFailed(messageOf(error)), state });
    } finally {
      setBusy(false);
    }
  }

  const outcome = outcomeShown(service, status);
  // While it waits, how an earlier sign-in ended is no longer news.
  const shown = lineNow ?? (waiting === undefined ? outcome : undefined);
  // Until the host answered where the sign-in stands, the line isn't known yet.
  const known = lineNow !== undefined || status !== undefined;
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
        <WaitingRow
          ref={waitingRow}
          service={service}
          busy={busy}
          cancelRef={cancelButton}
          size={buttonSize}
          onOpenAgain={openAgain}
          onCancel={() => void cancel()}
        />
      ) : (
        <StateRow
          state={state}
          busy={busy}
          size={buttonSize}
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

/** The line an action left under a sign-in, and the state it is about. */
interface ActionLine {
  readonly text: string;
  readonly state: PluginSignInState | undefined;
}

/** Whether the person is on something inside `element`. */
function hasFocus(element: HTMLElement | null): boolean {
  return element?.contains(document.activeElement) ?? false;
}

/**
 * Whether the host reports a sign-in as it did before: the same state, the same last outcome and
 * the same number of outcomes, so a repeat of the last outcome counts as a change.
 */
function sameStatus(
  before: PluginSignInStatus | undefined,
  now: PluginSignInStatus | undefined,
): boolean {
  return (
    before?.state === now?.state &&
    before?.outcomeCount === now?.outcomeCount &&
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
