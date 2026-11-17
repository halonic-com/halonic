import { Callout, Field, Select } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { RoutineChanges, RoutinesHost, RoutineView } from "../api.ts";
import { failureReason } from "../page/page-words.ts";
import { rulesWords as words } from "./rules-words.ts";

/** Props for {@link RulesSection}. */
export interface RulesSectionProps {
  readonly host: RoutinesHost;
  readonly routine: RoutineView;
}

/**
 * The Rules (`routines.rules.busy-and-missed`): what to do when the previous run is still busy
 * and what to do with times missed while closed or asleep. A rule that doesn't apply to the
 * trigger is left out, not greyed: Manual only has none, New mail has only the missed times
 * (mail is never skipped for being busy) and a web request only the busy rule.
 */
export function RulesSection({ host, routine }: RulesSectionProps) {
  const [failure, setFailure] = useState<string | undefined>();
  const kind = routine.trigger.kind;
  const showOverlap = kind !== "manual" && kind !== "mail";
  const showCatchUp = kind !== "manual" && kind !== "webhook";
  if (!showOverlap && !showCatchUp) return null;

  const save = async (changes: RoutineChanges) => {
    setFailure(undefined);
    try {
      await host.save(routine, changes);
    } catch (error) {
      setFailure(words.couldntSave(failureReason(error)));
    }
  };
  return (
    <section aria-labelledby="routine-rules" className="flex flex-col gap-3">
      <h2 id="routine-rules" className="text-label uppercase text-fg-muted">
        {words.label}
      </h2>
      {showOverlap && (
        <Field label={words.overlap}>
          <Select
            options={optionsOf(words.overlapOptions)}
            value={routine.overlap}
            onChange={(overlap) => void save({ overlap: overlap as RoutineView["overlap"] })}
          />
        </Field>
      )}
      {showCatchUp && (
        <Field label={words.catchUp}>
          <Select
            options={optionsOf(words.catchUpOptions)}
            value={routine.catchUp}
            onChange={(catchUp) => void save({ catchUp: catchUp as RoutineView["catchUp"] })}
          />
        </Field>
      )}
      {failure !== undefined && <Callout tone="danger">{failure}</Callout>}
    </section>
  );
}

function optionsOf(labels: Readonly<Record<string, string>>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}
