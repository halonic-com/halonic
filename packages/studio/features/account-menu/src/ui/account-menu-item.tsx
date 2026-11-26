import { Avatar, Menu, type MenuEntry } from "@halonicjs/studio-kit";
import type { Announcer, StatusBarItemProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { type AccountMenuFacts, type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { accountMenuWords, planItemWords } from "./account-menu-words.ts";

/** What the item shows: nothing yet, nothing at all, or the menu. */
type MenuState =
  | { readonly kind: "loading" }
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly facts: AccountMenuFacts; readonly signOutFailed: boolean };

/**
 * The account menu at the title bar's right end (`account-menu.menu`): the customer's initials,
 * opening "Signed in as {name}", the plan item with its usage (to AC-00 #plan), **Account** (to
 * AC-00) and **Sign out**, after which the feature's dialog host shows B4's signed-out page
 * (`account-menu.sign-out`). Without a host, while loading, when the computer has no menu or
 * can't say, or once signed out, it draws nothing.
 */
export function AccountMenuItem({ context }: StatusBarItemProps) {
  const host = context.services.find(AccountMenuHostService);
  const state = useAccountMenu(host, context.announcer);
  if (host === undefined || state.current.kind !== "shown") {
    return null;
  }
  return (
    <AccountMenu
      facts={state.current.facts}
      signOutFailed={state.current.signOutFailed}
      host={host}
      onSignOut={state.signOut}
    />
  );
}

function AccountMenu(props: {
  readonly facts: AccountMenuFacts;
  readonly signOutFailed: boolean;
  readonly host: AccountMenuHost;
  readonly onSignOut: () => void;
}) {
  const { facts, host } = props;
  const plan = planItemWords(facts.plan, facts.usedPercent);
  // Both the plan item and Account lead to the account page, so they sit together; Sign out
  // leaves the app, so it sits alone below its own divider, plain and with no confirm (HAL-18213).
  const entries: readonly MenuEntry[] = [
    { id: "plan", ...plan, onSelect: () => host.open(facts.planUrl) },
    { id: "account", label: accountMenuWords.account, onSelect: () => host.open(facts.accountUrl) },
    "divider",
    {
      id: "sign-out",
      label: accountMenuWords.signOut,
      detail: props.signOutFailed ? accountMenuWords.signOutFailed : undefined,
      onSelect: props.onSignOut,
    },
  ];
  return (
    <Menu
      align="end"
      description={accountMenuWords.signedInAs(facts.name)}
      entries={entries}
      trigger={(trigger) => (
        // Not a kit Button: its icon slot is 16px, which shrank the initials to an icon. The 28px
        // tile is as big as the 35px top bar takes (HAL-19536 item 3); the 40px is for headers.
        <button
          {...trigger}
          type="button"
          aria-label={accountMenuWords.trigger(facts.name)}
          className="focus-ring shrink-0 rounded-full hover:opacity-80"
        >
          <Avatar name={facts.name} />
        </button>
      )}
    />
  );
}

/**
 * Loads the facts once, and signs out: no menu on success, a note in the menu if not. The menu has
 * closed by then, so the note is also read out, or a screen reader would hear nothing.
 */
function useAccountMenu(host: AccountMenuHost | undefined, announcer: Announcer) {
  const [current, setCurrent] = useState<MenuState>(() => startState(host));
  useEffect(() => {
    // After Sign out there is no session to load, even when the window draws this item again in
    // another place (desktop and phone): the dialog host shows the signed-out page instead.
    if (host === undefined || host.signedOutOf() !== null) {
      return;
    }
    let live = true;
    host.load().then(
      (facts) => {
        if (live) setCurrent(facts === null ? { kind: "none" } : shown(facts));
      },
      // The computer couldn't say whether this Studio has an account menu: none is shown, as
      // for a 404, since a menu that can't name the customer can't be drawn either.
      (error: unknown) => {
        console.error("Couldn't read the account menu.", error);
        if (live) setCurrent({ kind: "none" });
      },
    );
    return () => {
      live = false;
    };
  }, [host]);
  const signOut = () => {
    if (host === undefined || current.kind !== "shown") {
      return;
    }
    const { facts } = current;
    host.signOut().then(
      () => setCurrent({ kind: "none" }),
      () => {
        setCurrent({ kind: "shown", facts, signOutFailed: true });
        announcer.announce(accountMenuWords.signOutFailed, "polite");
      },
    );
  };
  return { current, signOut };
}

function startState(host: AccountMenuHost | undefined): MenuState {
  const signedOut = host !== undefined && host.signedOutOf() !== null;
  return signedOut ? { kind: "none" } : { kind: "loading" };
}

function shown(facts: AccountMenuFacts): MenuState {
  return { kind: "shown", facts, signOutFailed: false };
}
