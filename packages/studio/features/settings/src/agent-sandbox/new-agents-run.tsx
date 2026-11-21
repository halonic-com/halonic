import type { HostSettings } from "@halonicjs/app";
import { Dialog, Field, Select } from "@halonicjs/studio-kit";
import { type ReactNode, useRef, useState } from "react";
import { useHostSetting } from "../assistant/use-host-setting.ts";
import { type NewAgentsRun, sandboxPrefs } from "./sandbox-prefs.ts";
import * as text from "./sandbox-text.ts";

const options = [
  { value: "sandbox", label: text.RUN_IN_SANDBOX },
  { value: "this-computer", label: text.RUN_ON_THIS_COMPUTER },
];

/** The props of {@link NewAgentsRunControl}. */
export interface NewAgentsRunControlProps {
  readonly settings: HostSettings;
  /** Served Studio and the phone only look. */
  readonly viewOnly: boolean;
  /** Whether this Studio can itself start an agent outside its sandbox, as its host reports it. */
  readonly studioStartsUnfenced: boolean;
}

/**
 * The hint under the Select. Where the choice can be changed and this Studio can't start such an
 * agent, a second line says what can (HAL-13194); served Studio only looks, so it says that alone.
 */
function hintFor(viewOnly: boolean, studioStartsUnfenced: boolean): ReactNode {
  if (viewOnly) return text.NEW_AGENTS_VIEW_ONLY;
  if (studioStartsUnfenced) return text.NEW_AGENTS_HINT;
  return (
    <>
      {text.NEW_AGENTS_HINT}
      <span className="block">{text.NEW_AGENTS_STUDIO_CANT_START}</span>
    </>
  );
}

/**
 * **New agents run** (`settings.new-agents-run`): a Select that saves at once. Picking **On this
 * computer** asks first and saves nothing until confirmed; Cancel or Escape leaves the Select
 * where it was and returns focus to it.
 */
export function NewAgentsRunControl({
  settings,
  viewOnly,
  studioStartsUnfenced,
}: NewAgentsRunControlProps) {
  const setting = useHostSetting(settings, sandboxPrefs.newAgents);
  const [asking, setAsking] = useState(false);
  const select = useRef<HTMLElement>(null);
  const pick = (value: string) => {
    if (value === "this-computer") setAsking(true);
    else void setting.save(value as NewAgentsRun);
  };
  return (
    <>
      <Field
        label={text.NEW_AGENTS_RUN}
        hint={hintFor(viewOnly, studioStartsUnfenced)}
        error={setting.failed ? text.newAgentsNotSaved : null}
      >
        <Select
          ref={select}
          options={options}
          value={setting.value}
          disabled={viewOnly}
          onChange={pick}
        />
      </Field>
      {asking ? (
        <Dialog
          title={text.RUN_HERE_TITLE}
          confirm={{ label: text.RUN_HERE_CONFIRM, variant: "danger", busyLabel: "Saving…" }}
          cancelLabel={text.REMOVE_CANCEL}
          returnFocus={() => select.current}
          onConfirm={() => {
            setAsking(false);
            void setting.save("this-computer");
          }}
          onCancel={() => setAsking(false)}
        >
          <p>{text.RUN_HERE_BODY}</p>
        </Dialog>
      ) : null}
    </>
  );
}
