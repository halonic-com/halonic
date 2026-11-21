import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import type { ItemPageSectionViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState } from "react";
import { type GoogleSetupAccount, GoogleSetupAccountsService } from "../api.ts";
import { GoogleConnectorBlock } from "./connector-block.tsx";

/** What the section last read: the account of its connector, and whether the read worked. */
interface Reading {
  readonly account: GoogleSetupAccount | undefined;
  readonly answering: boolean;
}

/**
 * The Google block on a connector's page (`google-setup.connector-section`). It shows the block
 * for the account whose setup is linked to this connector, and nothing for any other connector.
 * **Set up**, **Sign in again** and **Replace secret** open the account's setup item in the
 * Inbox; **Disconnect Google…** asks the app to disconnect and then reads the account again.
 * On a phone the block is text only. When the accounts can't be read, the block keeps what it last showed and says the engine isn't
 * answering.
 */
export function ConnectorSection({ item, context }: ItemPageSectionViewProps) {
  const accounts = context.services.get(GoogleSetupAccountsService);
  const inbox = context.services.get(InboxService);
  const [reading, setReading] = useState<Reading | undefined>(undefined);

  const read = useCallback(async () => {
    try {
      const listed = await accounts.list();
      const account = listed.find(({ record }) => record.connector.id === item.id);
      setReading({ account, answering: true });
    } catch {
      setReading((last) => ({ account: last?.account, answering: false }));
    }
  }, [accounts, item.id]);

  useEffect(() => {
    void read();
    return accounts.subscribe(() => void read());
  }, [accounts, read]);

  if (reading?.account === undefined) return null;
  const { account, answering } = reading;
  return (
    <GoogleConnectorBlock
      account={account}
      secretEntry={accounts.secretEntry}
      answering={answering}
      viewOnly={context.host === "phone"}
      onOpenSetup={(accountRef) => {
        inbox.openSetup("google", accountRef);
        context.openPlace?.("inbox");
      }}
      onDisconnect={async () => {
        const answer = await accounts.disconnect(account.record.accountRef);
        await read();
        return answer;
      }}
    />
  );
}
