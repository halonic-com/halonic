import { BackIcon, Button, Callout, SecretText } from "@halonicjs/studio-kit";
import { type Ref, useCallback, useId, useRef, useSyncExternalStore } from "react";
import type { PickModel } from "../pick-model/pick-model.ts";
import type { PickModelState } from "../pick-model/pick-model-state.ts";
import {
  buttonLabel,
  isAmber,
  messageText,
  trustLine,
  pickModelWords as words,
} from "../pick-model/pick-model-words.ts";
import {
  KeyBody,
  LocalBody,
  LocalStateLine,
  OffOption,
  OptionCard,
} from "./pick-model-options.tsx";

/** The props of {@link PickModelScreen}. */
export interface PickModelScreenProps {
  /** The screen's state and rules; the opener makes it and disposes of it. */
  readonly pick: PickModel;
  /** Back, next to the one button: back to where the screen was opened from. */
  readonly onBack: () => void;
}

/**
 * The first run's Pick a model screen (first-run-flow 3.3, Noah's sheets on HAL-8721): three
 * options in one group, the one button with Back beside it, and the trust line under it. An
 * option that can't be used here is drawn off and isn't a control (HAL-14799). The first-run
 * bar, with **Set up later** and **Something wrong?**, belongs to the frame that shows the screen.
 *
 * @example
 * <PickModelScreen pick={new PickModel(parts)} onBack={backToWorkflow} />
 */
export function PickModelScreen({ pick, onBack }: PickModelScreenProps) {
  const subscribe = useCallback((listener: () => void) => pick.subscribe(listener), [pick]);
  const state = useSyncExternalStore(subscribe, () => pick.state);
  const keyField = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const press = () => {
    const text = keyField.current?.value;
    void pick.press(text === undefined ? undefined : new SecretText(text));
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-8"
    >
      <div className="flex flex-col gap-1">
        <h1 id={headingId} className="text-title text-fg">
          {words.heading}
        </h1>
        <p className="text-body text-fg-muted">{words.intro}</p>
      </div>
      <Options pick={pick} state={state} labelId={headingId} keyField={keyField} />
      <Footer state={state} onPress={press} onBack={onBack} />
    </section>
  );
}

/** The three options as one group, named by the heading; an option that is off isn't a radio. */
function Options(props: {
  readonly pick: PickModel;
  readonly state: PickModelState;
  readonly labelId: string;
  readonly keyField: Ref<HTMLInputElement>;
}) {
  const { pick, state, keyField } = props;
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={props.labelId} className="flex flex-col gap-2">
      {state.keysOff ? (
        <OffOption title={words.key} why={words.keysOff} />
      ) : (
        <OptionCard
          name={name}
          ticked={state.picked === "key"}
          title={words.key}
          note={words.keyNote}
          onTick={() => pick.pick("key")}
        >
          <KeyBody pick={pick} state={state} keyField={keyField} />
          {state.picked === "key" && <Message state={state} />}
        </OptionCard>
      )}
      {state.local.kind === "desktop-only" ? (
        <OffOption title={words.local} note={words.localFree} why={words.localOff} />
      ) : (
        <OptionCard
          name={name}
          ticked={state.picked === "local"}
          title={words.local}
          note={
            <>
              {words.localFree}
              <LocalStateLine local={state.local} />
            </>
          }
          onTick={() => pick.pick("local")}
        >
          <LocalBody pick={pick} state={state} />
          {state.picked === "local" && <Message state={state} />}
        </OptionCard>
      )}
      <OptionCard
        name={name}
        ticked={state.picked === "sample"}
        title={words.sample}
        note={words.sampleHint}
        onTick={() => pick.pick("sample")}
      >
        <Callout tone="attention">{words.sampleNote}</Callout>
      </OptionCard>
    </div>
  );
}

/** What the test or Continue found, inside the ticked option: amber when the choice is fine, else red. */
function Message({ state }: { readonly state: PickModelState }) {
  if (state.message === undefined) return null;
  const tone = isAmber(state.message) ? "warning" : "danger";
  return (
    <Callout tone={tone} announce="polite">
      {messageText(state.message, state.provider)}
    </Callout>
  );
}

/**
 * Back and the one button, and the trust line under the button: right-aligned on a computer,
 * left on a phone (8e.3). Sample answers needs no trust, so it has no line.
 */
function Footer(props: {
  readonly state: PickModelState;
  readonly onPress: () => void;
  readonly onBack: () => void;
}) {
  const { state } = props;
  const line =
    state.picked === "sample" || state.line === undefined ? undefined : trustLine(state.line);
  const busy = state.busy !== undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" icon={<BackIcon />} onClick={props.onBack}>
          {words.back}
        </Button>
        <Button
          variant="primary"
          busy={busy}
          busyLabel={buttonLabel(state.button, state.busy)}
          onClick={busy ? undefined : props.onPress}
        >
          {buttonLabel(state.button, undefined)}
        </Button>
      </div>
      {line !== undefined && (
        <p className="text-right text-small text-fg-muted phone:text-left">{line}</p>
      )}
    </div>
  );
}
