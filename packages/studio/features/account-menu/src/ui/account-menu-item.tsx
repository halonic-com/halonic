import { Avatar, Button, Menu, type MenuEntry } from "@halonicjs/studio-kit";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { type AccountMenuFacts, type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { accountMenuWords, planItemWords } from "./account-menu-words.ts";
import { SignedOutPage } from "./signed-out-page.tsx";

/** What the item shows: nothing yet, nothing at all, the menu, or the signed-out page. */
type MenuState =
  | { readonly kind: "loading" }
  | { readonly kind: "none" }
  | { readonly kind: "shown"; readonly facts: AccountMenuFacts; readonly signOutFailed: boolean }
  | { readonly kind: "signed-out"; readonly productName: string };

/**
 * The account menu at the title bar's right end (`account-menu.menu`): the customer's initials,
 * opening "Signed in as {name}", the plan item with its usage (to AC-00 #plan), **Account** (to
 * AC-00) and **Sign out**, which shows B4's signed-out page (`account-menu.sign-out`). Without a
 * host, while loading, or when the computer has no menu or can't say, it draws nothing.
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
        <Button
          {...trigger}
          variant="ghost"
          icon={<Avatar name={facts.name} />}
          label={accountMenuWords.trigger(facts.name)}
        />
      )}
    />
  );
}

/** Loads the facts once, and signs out: the signed-out page on success, a note in the menu if not. */
function useAccountMenu(host: AccountMenuHost | undefined) {
  const [current, setCurrent] = useState<MenuState>(() => startState(host));
  useEffect(() => {
    // After Sign out there is no session to load: the signed-out page stays, even when the
    // window draws this item again in another place (desktop and phone).
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
      () => setCurrent({ kind: "signed-out", productName: facts.productName }),
      () => setCurrent({ kind: "shown", facts, signOutFailed: true }),
    );
  };
  return { current, signOut };
}

function startState(host: AccountMenuHost | undefined): MenuState {
  const productName = host?.signedOutOf() ?? null;
  return productName === null ? { kind: "loading" } : { kind: "signed-out", productName };
}

function shown(facts: AccountMenuFacts): MenuState {
  return { kind: "shown", facts, signOutFailed: false };
}
