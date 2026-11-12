import type { AccountType, SetupEdit } from "@halonicjs/google-setup";
import type { SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useState } from "react";
import { accountSteps } from "../account-steps.ts";
import type { GoogleSetupAccount, GoogleSetupAccounts } from "../api.ts";
import { AccountHeader } from "./account-header.tsx";
import { Checklist, currentStep } from "./checklist.tsx";

/** Props for {@link GoogleSetupView}: the Inbox's, and where the accounts are read and saved. */
export interface GoogleSetupViewProps extends SetupViewProps {
  readonly accounts: GoogleSetupAccounts;
}

/**
 * The account `ref` as the host has it now. It reads again when the host says it changed and
 * when this window gets focus again, so a change made in another window shows up. It keeps the
 * last account it saw if the host stops listing it, as the Inbox keeps the item open.
 */
function useAccount(accounts: GoogleSetupAccounts, ref: string): GoogleSetupAccount | undefined {
  const [account, setAccount] = useState<GoogleSetupAccount>();
  useEffect(() => {
    let current = true;
    const read = () =>
      accounts.list().then(
        (all) => {
          const found = all.find((candidate) => candidate.record.accountRef === ref);
          if (current && found !== undefined) setAccount(found);
        },
        // The Inbox already says when the engine isn't answering; the view keeps what it has.
        () => undefined,
      );
    void read();
    const stop = accounts.subscribe(() => void read());
    window.addEventListener("focus", read);
    return () => {
      current = false;
      stop();
      window.removeEventListener("focus", read);
    };
  }, [accounts, ref]);
  return account;
}

/**
 * The Google setup item at its current step (UX checklist section 2): the header, then the
 * checklist. The title of the step in hand takes focus as it mounts.
 */
export function GoogleSetupView({ item, answering, close, accounts }: GoogleSetupViewProps) {
  const account = useAccount(accounts, item.account);
  const steps = useMemo(
    () => (account === undefined ? [] : accountSteps(account, account.services)),
    [account],
  );

  if (account === undefined) {
    return (
      <div role="status" aria-label="Loading the Google setup" className="flex flex-col gap-3 p-4">
        <SkeletonBar kind="title" width="2/3" />
        <SkeletonBar kind="meta" width="full" />
      </div>
    );
  }

  const edit = (change: SetupEdit) => accounts.edit(account.record.accountRef, change);
  const asking = account.askAccountType;
  return (
    <section aria-label={item.title} className="flex flex-col gap-4 p-4">
      <AccountHeader
        email={account.email}
        serviceNames={account.services.map((service) => service.label)}
        accountType={account.record.accountType}
        asking={asking}
        progress={
          asking ? undefined : `Step ${currentStep(account, steps).number} of ${steps.length}`
        }
        answering={answering}
        onAccountType={(accountType: AccountType) => edit({ kind: "account-type", accountType })}
      />
      {asking ? null : (
        <Checklist
          account={account}
          steps={steps}
          answering={answering}
          onEdit={edit}
          close={close}
        />
      )}
    </section>
  );
}
