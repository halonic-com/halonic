import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useCallback, useSyncExternalStore } from "react";
import { type AccountMenuHost, AccountMenuHostService } from "../api.ts";
import { SignedOutPage } from "./signed-out-page.tsx";

/**
 * The account menu's dialog host (`account-menu.sign-out`): once the page has signed out, B4's
 * signed-out page over the whole window. The window draws it once in every layout, unlike the
 * menu's title bar item, which a phone draws only at the top of a place. Without a host, or
 * before Sign out, it draws nothing.
 */
export function SignedOutDialog({ context }: DialogHostProps) {
  const host = context.services.find(AccountMenuHostService);
  if (host === undefined) {
    return null;
  }
  return <SignedOutOf host={host} />;
}

function SignedOutOf({ host }: { readonly host: AccountMenuHost }) {
  const subscribe = useCallback((onChange: () => void) => host.onSignedOut(onChange), [host]);
  const productName = useSyncExternalStore(subscribe, () => host.signedOutOf());
  if (productName === null) {
    return null;
  }
  return <SignedOutPage productName={productName} onSignIn={() => host.open(host.signInAddress)} />;
}
