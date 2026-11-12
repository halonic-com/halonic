import type { AccountType, SetupEdit } from "@halonicjs/google-setup";
import type { SetupViewProps } from "@halonicjs/studio-feature-inbox/api";
import { EmptyState, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useMemo, useState } from "react";
import { accountSteps } from "../account-steps.ts";
import type { GoogleSetupAccount, GoogleSetupAccounts } from "../api.ts";
import { AccountHeader } from "./account-header.tsx";
import { Checklist, currentStep } from "./checklist.tsx";

/** Props for {@link GoogleSetupView}: the Inbox's, and where the accounts are read and saved. */
export interface GoogleSetupViewProps extends SetupViewProps {
  readonly accounts: GoogleSetupAccounts;
}

/** Why there is no account to show: the read failed, or the host doesn't list it. */
type Problem = "unreadable" | "unlisted";

/** What {@link useAccount} has: the account once it is read, else why not, and how to read again. */
interface AccountRead {
  readonly account: GoogleSetupAccount | undefined;
  readonly problem: Problem | undefined;
  readonly retry: () => void;
}

/**
 * The account `ref` as the host has it now. It reads again when the host says it changed and
 * when this window gets focus again, so a change made in another window shows up. It keeps the
 * last account it saw if the host stops listing it, as the Inbox keeps the item open. Only
 * while it has no account does a failed read or an unlisted account become a `problem`.
 */
function useAccount(accounts: GoogleSetupAccounts, ref: string): AccountRead {
  const [account, setAccount] = useState<GoogleSetupAccount>();
  const [problem, setProblem] = useState<Problem>();
  // Counts **Try again**, so the read starts again.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    // Only the newest read counts: an older one that answers late must not undo a newer one.
    let latest = 0;
    const read = () => {
      latest += 1;
      const mine = latest;
      return accounts.list().then(
        (all) => {
          const found = all.find((candidate) => candidate.record.accountRef === ref);
          if (!current || mine !== latest) return;
          if (found === undefined) setProblem("unlisted");
          else {
            setAccount(found);
            setProblem(undefined);
          }
        },
        () => {
          if (current && mine === latest) setProblem("unreadable");
        },
      );
    };
    void read();
    const stop = accounts.subscribe(() => void read());
    window.addEventListener("focus", read);
    return () => {
      current = false;
      stop();
      window.removeEventListener("focus", read);
    };
  }, [accounts, ref, attempt]);
  return { account, problem, retry: () => setAttempt((count) => count + 1) };
}

/**
 * The Google setup item at its current step (UX checklist section 2): the header, then the
 * checklist. The title of the step in hand takes focus as it mounts.
 */
export function GoogleSetupView({ item, answering, close, accounts }: GoogleSetupViewProps) {
  const { account, problem, retry } = useAccount(accounts, item.account);
  const steps = useMemo(
    () => (account === undefined ? [] : accountSteps(account, account.services)),
    [account],
  );

  if (account === undefined && problem !== undefined) {
    return (
      <div className="p-4">
        <EmptyState
          tone="error"
          align="start"
          title="Couldn't load the Google setup"
          description={
            problem === "unlisted"
              ? "This Google account isn't set up here any more."
              : "The engine isn't answering."
          }
          action={{ label: "Try again", onClick: retry }}
        />
      </div>
    );
  }
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
  const current = currentStep(account, steps);
  return (
    <section aria-label={item.title} className="flex flex-col gap-4 p-4">
      <AccountHeader
        email={account.email}
        serviceNames={account.services.map((service) => service.label)}
        accountType={account.record.accountType}
        asking={asking}
        progress={
          asking || current === undefined ? undefined : `Step ${current.number} of ${steps.length}`
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
