import type { HostSettings } from "@halonicjs/app";
import { Dialog, Field, Select } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
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
}

/**
 * **New agents run** (`settings.new-agents-run`): a Select that saves at once. Picking **On this
 * computer** asks first and saves nothing until confirmed; Cancel or Escape leaves the Select
 * where it was and returns focus to it.
 */
export function NewAgentsRunControl({ settings, viewOnly }: NewAgentsRunControlProps) {
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
        hint={viewOnly ? text.NEW_AGENTS_VIEW_ONLY : text.NEW_AGENTS_HINT}
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
