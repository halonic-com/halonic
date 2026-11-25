import { Avatar, Button, Menu, type MenuEntry } from "@halonicjs/studio-kit";
import {
  type ActiveAccount,
  ActiveAccountService,
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
  chooseSource,
} from "@halonicjs/studio-services";
import type { StatusBarItemProps } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { accountSwitcherWords } from "../connections-words.ts";

/** What a connection is called in the menu: the user it is signed in as, else its label. */
export function accountName(connection: AgentConnection): string {
  return connection.userName ?? connection.label;
}

/** The name the avatar takes its initials from: a label's "·" separators would become the letters. */
function initialsSource(connection: AgentConnection): string {
  return accountName(connection).replaceAll("·", " ");
}

/**
 * The account switcher at the sidebar's bottom left (`connections.account-switcher`): the active
 * account's initials, opening a menu of the linked accounts by the user each is signed in as, with
 * the active one marked, and Settings › Connections. Picking an account makes Inbox and Messenger,
 * in every window, show that account. Without connections or the active account, or with no
 * account linked, it draws nothing.
 */
export function AccountSwitcherItem({ context }: StatusBarItemProps) {
  const connections = context.services.find(AgentConnectionsService);
  const active = context.services.find(ActiveAccountService);
  if (connections === undefined || active === undefined) return null;
  return (
    <AccountSwitcher
      connections={connections}
      active={active}
      onSettings={
        context.openSettings === undefined ? undefined : () => context.openSettings?.("connections")
      }
    />
  );
}

function AccountSwitcher(props: {
  readonly connections: AgentConnections;
  readonly active: ActiveAccount;
  readonly onSettings: (() => void) | undefined;
}) {
  const { connections, active } = props;
  const list = useConnections(connections);
  useActivePick(active);
  const shown = chooseSource(list, active.preferred());
  const current = list.find((connection) => connection.id === shown);
  if (current === undefined) return null;
  const entries: MenuEntry[] = list.map((connection) => ({
    id: connection.id,
    label: accountName(connection),
    checked: connection.id === shown,
    onSelect: () => {
      active.select(connection.id).catch((error: unknown) => {
        console.error("Switching the account", error);
      });
    },
  }));
  if (props.onSettings !== undefined) {
    entries.push("divider", {
      id: "settings",
      label: accountSwitcherWords.settings,
      onSelect: props.onSettings,
    });
  }
  return (
    <Menu
      align="start"
      description={accountSwitcherWords.lead}
      entries={entries}
      trigger={(trigger) => (
        <Button
          {...trigger}
          variant="ghost"
          icon={<Avatar name={initialsSource(current)} />}
          label={accountSwitcherWords.trigger(accountName(current))}
        />
      )}
    />
  );
}

/** The connections, read again whenever the engine says they changed. */
function useConnections(connections: AgentConnections): readonly AgentConnection[] {
  const [list, setList] = useState<readonly AgentConnection[]>([]);
  useEffect(() => {
    let live = true;
    const read = () => {
      connections.list().then(
        (next) => {
          if (live) setList(next);
        },
        (error: unknown) =>
          console.error("The account switcher couldn't read the connections", error),
      );
    };
    read();
    const stop = connections.subscribe(read);
    return () => {
      live = false;
      stop();
    };
  }, [connections]);
  return list;
}

/** Draws again whenever the pick changes, here or in another window. */
function useActivePick(active: ActiveAccount): void {
  const [, setTick] = useState(0);
  useEffect(() => active.subscribe(() => setTick((tick) => tick + 1)), [active]);
}
