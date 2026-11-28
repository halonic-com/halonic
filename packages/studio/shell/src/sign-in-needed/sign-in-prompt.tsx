import { SignInBand, SignInModal, useOpenExternal } from "@halonicjs/studio-kit";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type AnnouncerTimers, systemTimers } from "../announcer/timers.ts";
import type { Registered } from "../points/point-store.ts";
import type { WorkspaceContext } from "../workspace-context.ts";
import { createBroadcastSignInChannel, type SignInChannel } from "./sign-in-channel.ts";
import { type SignInPrompt as Shown, SignInNeeds, type SignInWindow } from "./sign-in-needs.ts";
import type { SignInContribution } from "./sign-ins.ts";

/** Props for {@link SignInPrompt}. */
export interface SignInPromptProps {
  /** The window it draws in: Studio's, or a focused app's. */
  readonly window: SignInWindow;
  /** The app's name, as in "Inbox needs your Paperclip sign-in to work." */
  readonly appTitle: string;
  /** The sign-ins the features added. */
  readonly signIns: readonly Registered<SignInContribution>[];
  /**
   * The context of the feature with the given id, as the window builds it. It may change with
   * every page; the prompt always reads the latest, and keeps a waiting sign-in.
   */
  readonly contextFor: (featureId: string) => WorkspaceContext;
  /** The open workspace: another one starts over, reading its own sign-ins. */
  readonly workspace: object;
  /** Makes the channel to the other windows; a `BroadcastChannel` by default. */
  readonly channel?: (() => SignInChannel) | undefined;
  readonly timers?: Pick<AnnouncerTimers, "now"> | undefined;
}

const nothingShown: Shown = { blocking: [], notBlocking: [], unreadable: false };

/**
 * The needed sign-ins in one window (`shell.sign-in-needed`): the kit's `SignInModal` for those
 * the window's app can't work without, and its `SignInBand` for the others. Every window draws it
 * once, so every app shows sign-ins the same way. It reads them again when another window finished
 * a sign-in, and when the window gets focus.
 */
export function SignInPrompt(props: SignInPromptProps) {
  const needs = useSignInNeeds(props);
  const subscribe = useCallback(
    (listener: () => void) => needs?.subscribe(listener) ?? (() => undefined),
    [needs],
  );
  const shown = useSyncExternalStore(subscribe, () => needs?.current() ?? nothingShown);
  if (needs === undefined) {
    return null;
  }
  const signIn = (key: string): void => {
    needs.signIn(key).catch((error: unknown) => console.error("A sign-in failed.", error));
  };
  return (
    <>
      <SignInBand
        signIns={shown.notBlocking}
        unreadable={shown.unreadable}
        onSignIn={signIn}
        onTryAgain={() => needs.readAgain()}
      />
      {shown.blocking.length > 0 ? (
        <SignInModal app={props.appTitle} signIns={shown.blocking} onSignIn={signIn} />
      ) : null}
    </>
  );
}

/**
 * One {@link SignInNeeds} while mounted, with its channel; a new one only when the window, the
 * workspace or the sign-ins change. `contextFor` and `openExternal` are read through refs, because
 * Studio's `contextFor` changes on every page and a new `SignInNeeds` would lose a waiting sign-in.
 */
function useSignInNeeds(props: SignInPromptProps): SignInNeeds | undefined {
  const { window: shownIn, signIns, workspace, channel, timers } = props;
  const latestContextFor = useRef(props.contextFor);
  latestContextFor.current = props.contextFor;
  const openExternal = useOpenExternal();
  const latestOpenExternal = useRef(openExternal);
  latestOpenExternal.current = openExternal;
  const [needs, setNeeds] = useState<SignInNeeds | undefined>(undefined);

  useEffect(() => {
    const opened = (channel ?? createBroadcastSignInChannel)();
    const created = new SignInNeeds({
      window: shownIn,
      signIns,
      contextFor: (featureId) => latestContextFor.current(featureId),
      channel: opened,
      timers: timers ?? systemTimers,
      openExternal: (url) =>
        latestOpenExternal.current(url).catch((error: unknown) => {
          console.error("Couldn't open the sign-in page.", error);
          throw error;
        }),
    });
    const onFocus = (): void => created.windowFocused();
    globalThis.addEventListener("focus", onFocus);
    created.start();
    setNeeds(created);
    return () => {
      globalThis.removeEventListener("focus", onFocus);
      created.stop();
      opened.close();
    };
  }, [shownIn, signIns, workspace, channel, timers]);

  return needs;
}
