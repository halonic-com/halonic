import type { Plugin } from "@halonicjs/format";
import { Button, Callout, StatusChip } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useId, useState } from "react";
import { messageOf } from "../message-of.ts";
import type { PluginSettingsReader } from "../settings/plugin-settings-section.tsx";
import { type SignInFacts, signInFacts, tokenHostDiffers } from "./sign-in-facts.ts";
import {
  CLIENT_SECRET_NOT_SET,
  outcomeLine,
  SETTINGS_NEEDED,
  SIGN_IN,
  SIGN_IN_AGAIN,
  SIGN_IN_CHANGED,
  SIGN_IN_UNAVAILABLE_HERE,
  SIGN_INS_HEADING,
  SIGN_OUT,
  SIGNED_IN,
  type SignInOutcome,
  signedOutNotConfirmed,
  signInNotStarted,
  signInsNotLoaded,
  signOutFailed,
  tokenHostWarning,
  trustLine,
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
 * The app's way to a plugin's sign-ins: the agent host's sign-in routes and
 * the system browser. The page never holds a code, a token or a client secret.
 */
export interface PluginSignIns {
  status(plugin: string): Promise<readonly PluginSignInStatus[]>;
  /** Starts a sign-in and answers the address to open. Throws with the host's `kind` when it refuses. */
  start(plugin: string, signIn: string): Promise<string>;
  signOut(plugin: string, signIn: string): Promise<PluginSignOutResult>;
  /** Opens the address in the person's browser. */
  openInBrowser(url: string): Promise<void>;
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
}

/**
 * A plugin's sign-ins (HAL-984 design section 6, approved on HAL-8619): one
 * block each, with its purpose, the trust check line, the token host warning
 * when the hosts differ, and **Sign in**, **Signed in** with **Sign out**, or
 * **Sign in again** with the reason. After the browser sign-in, the person
 * comes back to Halonic, and the section reads where the sign-ins stand again
 * when the window gets focus. A plugin without sign-ins shows nothing.
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
        <Callout tone="danger">{signInsNotLoaded(plugin.name, problem)}</Callout>
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
}

/** One sign-in: what it does, where it stands, its one button and the line under it. */
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
}: SignInBlockProps) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<string | undefined>(undefined);
  const state = facts === undefined ? "cannotSignIn" : status?.state;

  async function signIn() {
    setBusy(true);
    setLine(undefined);
    try {
      const address = await signIns.start(plugin, name);
      await signIns.openInBrowser(address);
    } catch (error) {
      setLine(startFailedLine(error));
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

  const outcome =
    status?.lastOutcome === undefined ? undefined : outcomeLine(service, status.lastOutcome);
  const shown = line ?? outcome;

  return (
    <li className="flex flex-col gap-2">
      <p className="text-body-strong wrap-anywhere">{purpose}</p>
      {facts === undefined ? null : (
        <>
          <p className="text-small text-fg-muted wrap-anywhere">{trustLine(service, facts)}</p>
          {tokenHostDiffers(facts) ? (
            <Callout tone="attention">{tokenHostWarning(facts)}</Callout>
          ) : null}
        </>
      )}
      <StateRow state={state} busy={busy} actions={actions} onSignIn={signIn} onSignOut={signOut} />
      {shown === undefined ? null : (
        <p role="status" className="text-small text-fg-muted wrap-anywhere">
          {shown}
        </p>
      )}
    </li>
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

/** The line when **Sign in** couldn't start: the host's refusal in words, or the reason. */
function startFailedLine(error: unknown): string {
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
