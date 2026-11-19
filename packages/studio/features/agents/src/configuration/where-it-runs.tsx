import { Callout, Dialog, Field, RadioGroup, type RadioOption } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { AgentPlacementState, AgentSettings, AgentsHost } from "../api.ts";
import { configurationWords } from "./configuration-words.ts";
import { usePlacement } from "./use-placement.ts";

const words = configurationWords.whereItRuns;

/** The two choices of Where it runs. */
type RunsOn = "sandbox" | "this-computer";

/** Props for {@link WhereItRuns}. */
export interface WhereItRunsProps {
  readonly host: AgentsHost;
  readonly settings: AgentSettings;
}

/**
 * The warning while it is open: the fingerprint of the file it warns about, and why the last
 * confirm didn't save, if it didn't.
 */
interface Warning {
  readonly fingerprint: string;
  readonly error?: string;
}

/** The choice the page shows: a choice on hold stays On this computer, held, not dropped (3.8). */
function shownChoice(placement: AgentPlacementState): RunsOn {
  return placement.runsOn === "sandbox" ? "sandbox" : "this-computer";
}

/** The words of a throw. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const options: RadioOption<RunsOn>[] = [
  { value: "sandbox", label: words.inSandbox, note: words.inSandboxNote },
  { value: "this-computer", label: words.onThisComputer, note: words.onThisComputerNote },
];

/**
 * Harness › Where it runs (`agents.configuration.where-it-runs`; checklist 3.8). The sandbox
 * saves at once. On this computer saves only after the warning, for the file the person was
 * warned about: Cancel is focused and **Run on this computer** is the danger button. When the
 * agent's file changed since, the choice is on hold: a Callout with **Review and confirm** opens
 * the same warning. While the agent's file has unsaved changes, the warning asks the person to
 * save first: the choice is for the saved file, which may hold what they already took out. Not drawn
 * where Studio can't choose (the browser).
 */
export function WhereItRuns({ host, settings }: WhereItRunsProps) {
  const ref = { hubId: settings.hubId, id: settings.id };
  const { load, reload } = usePlacement(host, settings.hubId, settings.id);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveFirstId = useId();

  if (load.kind === "loading" || load.kind === "unavailable") return null;
  if (load.kind === "failed") {
    return (
      <Field label={words.label}>
        <Callout tone="warning" action={{ label: configurationWords.tryAgain, onClick: reload }}>
          {words.couldntRead(load.reason)}
        </Callout>
      </Field>
    );
  }
  const { placement } = load;
  const saveFirst = placement.unsaved ? { unavailable: { reason: saveFirstId } } : {};

  const pick = async (next: RunsOn) => {
    setError(null);
    if (next === shownChoice(placement)) return;
    if (next === "this-computer") {
      setWarning({ fingerprint: placement.fingerprint });
      return;
    }
    try {
      await host.chooseSandbox(ref);
    } catch (thrown) {
      setError(words.notSaved(reasonOf(thrown)));
    }
    await reload();
  };

  const confirm = async (shown: Warning) => {
    setBusy(true);
    try {
      const chosen = await host.chooseThisComputer(ref, shown.fingerprint);
      if (chosen.saved) {
        setWarning(null);
        await reload();
      } else {
        // The file changed while the person read: warn again, about the file as it is now.
        setWarning({
          fingerprint: chosen.fingerprint,
          error: words.changedWhileOpen(settings.name),
        });
      }
    } catch (thrown) {
      setWarning({ ...shown, error: words.notSaved(reasonOf(thrown)) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label={words.label} error={error}>
        <div className="flex flex-col gap-3">
          {placement.runsOn === "on-hold" && (
            <Callout
              tone="warning"
              action={{
                label: words.reviewAndConfirm,
                onClick: () => setWarning({ fingerprint: placement.fingerprint }),
              }}
            >
              {words.onHold(settings.name)}
            </Callout>
          )}
          <RadioGroup
            options={options}
            value={shownChoice(placement)}
            onChange={(next) => void pick(next)}
          />
        </div>
      </Field>
      {warning !== null && (
        <Dialog
          title={words.warningTitle(settings.name)}
          confirm={{
            label: words.confirm,
            variant: "danger",
            busyLabel: words.saving,
            ...saveFirst,
          }}
          cancelLabel={words.cancel}
          busy={busy}
          {...(warning.error === undefined ? {} : { error: warning.error })}
          onConfirm={() => void confirm(warning)}
          onCancel={() => setWarning(null)}
        >
          <p>{words.warningAccess(settings.name)}</p>
          <p>{words.warningTrust(settings.name)}</p>
          {placement.unsaved && (
            <Callout tone="warning">
              <span id={saveFirstId}>{words.saveFirst(settings.name)}</span>
            </Callout>
          )}
        </Dialog>
      )}
    </>
  );
}
