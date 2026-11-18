import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import {
  currentApiOffs,
  RunsListService,
  type SourcedRun,
} from "@halonicjs/studio-feature-runs/api";
import type { BadgeState, WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect } from "react";
import { type GoogleSetupAccount, GoogleSetupAccountsService } from "../api.ts";
import { apiOffBadge } from "../api-off-badges.ts";
import { connectorBadge } from "../connector-badges.ts";

/** What {@link ConnectorBadges} gets from the shell's dialog hosts. */
export interface ConnectorBadgesProps {
  readonly context: WorkspaceContext;
}

/** What pressing a badge does. */
interface BadgeActions {
  readonly fixAccount: (accountRef: string) => void;
  readonly openRun: (hubId: string, runId: string) => void;
}

/**
 * The badges for these accounts and runs: the accounts' own first, then one for each switched-off
 * API. The API badges are the connector's, so they go with the last account.
 */
function badgesFor(
  accounts: readonly GoogleSetupAccount[],
  runs: readonly SourcedRun[],
  actions: BadgeActions,
): BadgeState[] {
  const badges = accounts.flatMap((account) => connectorBadge(account, actions.fixAccount) ?? []);
  if (accounts.length === 0) return badges;
  for (const off of currentApiOffs(runs)) badges.push(apiOffBadge(off, actions.openRun));
  return badges;
}

/**
 * Draws nothing. It keeps the header badges for the open workspace's Google accounts: one for each
 * account that needs a sign-in again or a new secret, removed when the account is fixed, and one
 * for each Google API the runs say is switched off, removed when a later run gets past it or no
 * account is left. Each account badge's button opens that account's setup item in the Inbox; an
 * API badge's button opens the newest failed run's page. A window without badges, such as a
 * phone's, shows none.
 */
export function ConnectorBadges({ context }: ConnectorBadgesProps) {
  const { badges, openPlace } = context;
  const accounts = context.services.get(GoogleSetupAccountsService);
  const inbox = context.services.get(InboxService);
  const runs = context.services.get(RunsListService);

  useEffect(() => {
    if (badges === undefined) return undefined;
    let removers: (() => void)[] = [];
    let stopped = false;
    const show = async () => {
      const listed = await accounts.list().catch((error: unknown) => {
        console.error("Couldn't list the Google accounts for the connector badges.", error);
        return undefined;
      });
      if (stopped || listed === undefined) return;
      for (const remove of removers) remove();
      removers = [];
      for (const badge of badgesFor(listed, runs.state.runs, {
        fixAccount: (ref) => {
          inbox.openSetup("google", ref);
          openPlace?.("inbox");
        },
        openRun: (hub, id) => context.openItem?.({ kind: "run", hub, id }),
      })) {
        removers.push(badges.add(badge));
      }
    };
    void show();
    const unsubscribeAccounts = accounts.subscribe(() => void show());
    const unsubscribeRuns = runs.subscribe(() => void show());
    return () => {
      stopped = true;
      unsubscribeAccounts();
      unsubscribeRuns();
      for (const remove of removers) remove();
    };
  }, [accounts, inbox, runs, badges, openPlace, context]);

  return null;
}
