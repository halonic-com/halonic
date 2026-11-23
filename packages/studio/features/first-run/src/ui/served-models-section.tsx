import type { CurrentModel } from "@halonicjs/app";
import { Button } from "@halonicjs/studio-kit";
import type { SettingsSectionProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useState } from "react";
import { ModelChoiceHostService, type ModelChoiceService } from "../api.ts";
import { PickModel } from "../pick-model/pick-model.ts";
import type { PickModelDone } from "../pick-model/pick-model-state.ts";
import { trustOnComputer } from "../pick-model/pick-model-words.ts";
import {
  currentModelName,
  servedModelsWords as words,
} from "../served-models/served-models-words.ts";
import { PickModelScreen } from "./pick-model-screen.tsx";

/** Settings › Models of a served window, as the settings container shows it. */
export function ServedModelsSection({ context }: SettingsSectionProps) {
  return <ServedModelsView service={context.services.get(ModelChoiceHostService)} />;
}

/** The props of {@link ServedModelsView}. */
export interface ServedModelsViewProps {
  /** The computer's model choice, through the served routes. */
  readonly service: ModelChoiceService;
}

/**
 * Settings › Models of a served window (`first-run.served-models`, HAL-16248 option A): the Model
 * row names the current model and has **Pick a model**, which opens the Pick a model screen
 * (first-run-flow 3.3) in its place, unchanged. **Back** and Sample answers come back to the row
 * with nothing changed. A saved choice comes back to the row naming the new model, with "Saved.
 * Trust this workspace on your computer before your next run." when the computer doesn't trust
 * the workspace now, since trust is a step at the computer (HAL-14808, D2).
 *
 * @example
 * <ServedModelsView service={new ServedModelChoice(fetch)} />
 */
export function ServedModelsView({ service }: ServedModelsViewProps) {
  const [current, setCurrent] = useState<CurrentModel | undefined>();
  const [picking, setPicking] = useState(false);
  const [saved, setSaved] = useState<string | undefined>();
  const read = useCallback(() => {
    service.current().then(setCurrent, (error: unknown) => {
      console.error("Settings › Models couldn't read the current model", error);
    });
  }, [service]);
  useEffect(read, [read]);
  const done = (result: PickModelDone) => {
    setPicking(false);
    if (result.kind !== "saved") return;
    setSaved(result.trusted ? undefined : trustOnComputer);
    read();
  };

  if (picking) {
    return <PickModelHere service={service} done={done} back={() => setPicking(false)} />;
  }
  const name = currentModelName(current);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-body text-fg">{words.model}</span>
          {name === undefined ? null : <span className="text-small text-fg-muted">{name}</span>}
        </div>
        <Button
          onClick={() => {
            setSaved(undefined);
            setPicking(true);
          }}
        >
          {words.pick}
        </Button>
      </div>
      {saved === undefined ? null : (
        <p role="status" className="text-small text-fg">
          {saved}
        </p>
      )}
    </div>
  );
}

/** The Pick a model screen in the section's place, with its own `PickModel` while it shows. */
function PickModelHere(props: {
  readonly service: ModelChoiceService;
  readonly done: (result: PickModelDone) => void;
  readonly back: () => void;
}) {
  const { service, done, back } = props;
  const [pick] = useState(
    () =>
      new PickModel({
        service,
        setTimer: (callback, delayMs) => {
          const timer = setTimeout(callback, delayMs);
          return () => clearTimeout(timer);
        },
        done,
        report: (error) => console.error("The Pick a model screen", error),
      }),
  );
  useEffect(() => () => pick.dispose(), [pick]);
  return <PickModelScreen pick={pick} onBack={back} />;
}
