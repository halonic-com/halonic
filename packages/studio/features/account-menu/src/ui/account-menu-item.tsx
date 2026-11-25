import { Avatar, Menu, type MenuEntry, usePresentation } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { type AccountMenuFacts, type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { accountMenuWords, nearlyUsedPercent, usageLine } from "./account-menu-words.ts";
import { SignedOutPage } from "./signed-out-page.tsx";

/** What the item shows: nothing yet, nothing at all, the menu, or the signed-out page. */
type MenuState =
  | { readonly kind: "loading" }
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly facts: AccountMenuFacts; readonly signOutFailed: boolean }
  | { readonly kind: "signed-out"; readonly productName: string };

/**
 * The account menu at the title bar's right end (`account-menu.menu`): the customer's initials,
 * opening their name, the plan and usage line (to AC-00 #plan), **Account** (to AC-00) and
 * **Sign out**, which shows B4's signed-out page (`account-menu.sign-out`). Without a host, or
 * when the computer has no menu or can't say, it draws nothing.
 */
export function AccountMenuItem({ context }: StatusBarItemProps) {
  const host = context.services.find(AccountMenuHostService);
  const state = useAccountMenu(host);
  if (host === undefined || state.current.kind === "loading" || state.current.kind === "none") {
    return null;
  }
  if (state.current.kind === "signed-out") {
    return (
      <SignedOutPage
        productName={state.current.productName}
        onSignIn={() => host.open(host.signInAddress)}
      />
    );
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
  const phone = usePresentation() === "phone";
  const nearlyUsed = facts.usedPercent !== null && facts.usedPercent >= nearlyUsedPercent;
  const entries: readonly MenuEntry[] = [
    { heading: facts.name },
    {
      id: "usage",
      label: usageLine(facts.plan, facts.usedPercent),
      attention: nearlyUsed ? accountMenuWords.nearlyUsed : undefined,
      onSelect: () => host.open(facts.planUrl),
    },
    "divider",
    { id: "account", label: accountMenuWords.account, onSelect: () => host.open(facts.accountUrl) },
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
      entries={entries}
      trigger={(trigger) => (
        <button
          {...trigger}
          type="button"
          aria-label={accountMenuWords.trigger(facts.name)}
          className={`${triggerClasses} ${phone ? "size-12" : "size-7"}`}
        >
          <Avatar name={facts.name} />
        </button>
      )}
    />
  );
}

const triggerClasses =
  "inline-flex shrink-0 items-center justify-center rounded-full outline-none focus-ring";

/** Loads the facts once, and signs out: the signed-out page on success, a note in the menu if not. */
function useAccountMenu(host: AccountMenuHost | undefined) {
  const [current, setCurrent] = useState<MenuState>({ kind: "loading" });
  useEffect(() => {
    if (host === undefined) {
      return;
    }
    let live = true;
    host.load().then(
      (facts) => {
        if (live) setCurrent(facts === null ? { kind: "none" } : shown(facts));
      },
      // The computer couldn't say whether this Studio has an account menu: none is shown, as
      // for a 404, since a menu that can't name the customer can't be drawn either.
      () => {
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
      () => setCurrent({ kind: "signed-out", productName: facts.productName }),
      () => setCurrent({ kind: "shown", facts, signOutFailed: true }),
    );
  };
  return { current, signOut };
}

function shown(facts: AccountMenuFacts): MenuState {
  return { kind: "shown", facts, signOutFailed: false };
}
