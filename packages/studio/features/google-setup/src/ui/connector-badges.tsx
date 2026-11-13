import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect } from "react";
import { GoogleSetupAccountsService } from "../api.ts";
import { connectorBadge } from "../connector-badges.ts";

/** What {@link ConnectorBadges} gets from the shell's dialog hosts. */
export interface ConnectorBadgesProps {
  readonly context: WorkspaceContext;
}

/**
 * Draws nothing. It keeps the header badges for the open workspace's Google accounts: one for each
 * account that needs a sign-in again or a new secret, removed when the account is fixed. Each
 * badge's button opens that account's setup item in the Inbox. A window without badges, such as
 * a phone's, shows none.
 */
export function ConnectorBadges({ context }: ConnectorBadgesProps) {
  const { badges, openPlace } = context;
  const accounts = context.services.get(GoogleSetupAccountsService);
  const inbox = context.services.get(InboxService);

  useEffect(() => {
    if (badges === undefined) return undefined;
    let removers: (() => void)[] = [];
    let stopped = false;
    const show = async () => {
      const listed = await accounts.list().catch(() => undefined);
      if (stopped || listed === undefined) return;
      for (const remove of removers) remove();
      removers = [];
      for (const account of listed) {
        const badge = connectorBadge(account, (ref) => {
          inbox.openSetup("google", ref);
          openPlace?.("inbox");
        });
        if (badge !== undefined) removers.push(badges.add(badge));
      }
    };
    void show();
    const unsubscribe = accounts.subscribe(() => void show());
    return () => {
      stopped = true;
      unsubscribe();
      for (const remove of removers) remove();
    };
  }, [accounts, inbox, badges, openPlace]);

  return null;
}
