import { defaultCurrency } from "@halonicjs/app";
import { Button } from "@halonicjs/studio-kit";
import { hasBudget, isPayPerUse } from "@halonicjs/workspace";
import { useEffect, useId, useRef, useState } from "react";
import type { ModelsState } from "../aliases/read-models.ts";
import type { ModelsFiles } from "../api.ts";
import { BudgetEditor } from "./budget-editor.tsx";
import {
  BUDGET_HEADING,
  budgetSummary,
  CHANGE_BUDGET,
  noBudgetLine,
  SET_BUDGET,
} from "./budget-text.ts";

/** The props of {@link BudgetBlock}. */
export interface BudgetBlockProps {
  readonly files: ModelsFiles;
  readonly state: ModelsState;
}

/**
 * The Budget block at the top of the Models section (`models.budget.budget-settings`): the budget that is
 * set, or a quiet line naming the providers that may bill per use and have none, and **Change** to
 * edit the two amounts in place. It shows only when a provider may bill per use or a budget is set.
 * When the editor closes, focus returns to the button that opened it. After a budget is removed
 * the block stays for the visit with **Set budget**, so focus has somewhere to go.
 *
 * @example
 * <BudgetBlock files={files} state={state} />
 */
export function BudgetBlock({ files, state }: BudgetBlockProps) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const setButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [lingering, setLingering] = useState(false);
  const budget = state.status === "loading" ? undefined : state.budget;
  /** Focus is owed after the editor closes; after a write it waits for the new budget to show. */
  const owed = useRef<"no" | "now" | "saved">("no");
  const budgetAtClose = useRef(budget);
  useEffect(() => {
    if (editing || owed.current === "no") return;
    (changeButton.current ?? setButton.current ?? heading.current)?.focus();
    const waiting = owed.current === "saved" && budgetAtClose.current === budget;
    owed.current = waiting ? "saved" : "no";
  }, [editing, budget]);

  if (state.status === "loading") return null;
  const names = state.providers.filter(isPayPerUse).map((provider) => provider.name ?? provider.id);
  if (names.length === 0 && !hasBudget(budget) && !lingering) return null;
  const currency = budget?.currency ?? defaultCurrency;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id={headingId} ref={heading} tabIndex={-1} className="text-heading">
          {BUDGET_HEADING}
        </h3>
        {hasBudget(budget) && !editing ? (
          <Button ref={changeButton} variant="secondary" onClick={() => setEditing(true)}>
            {CHANGE_BUDGET}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <BudgetEditor
          files={files}
          currency={currency}
          initial={budget ?? {}}
          onClose={(wrote) => {
            owed.current = wrote ? "saved" : "now";
            if (wrote) setLingering(true);
            budgetAtClose.current = budget;
            setEditing(false);
          }}
        />
      ) : (
        <p className="flex items-center gap-2">
          {hasBudget(budget) ? (
            budgetSummary(budget ?? {}, currency)
          ) : (
            <>
              {noBudgetLine(names)} ·
              <Button ref={setButton} variant="secondary" onClick={() => setEditing(true)}>
                {SET_BUDGET}
              </Button>
            </>
          )}
        </p>
      )}
    </section>
  );
}
