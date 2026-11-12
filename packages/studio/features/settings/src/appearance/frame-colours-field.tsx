import { ColourPopover, Field, Input, parseHex, Select } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { DisplaySettings } from "../display-settings.ts";
import { useDisplaySetting } from "../use-display-setting.ts";
import {
  type FrameColourPair,
  type FrameColours,
  frameColourPair,
  frameColoursPref,
} from "./appearance-prefs.ts";
import {
  COLOUR_ERROR,
  chooseColour,
  colourPopoverLabel,
  colourSwatches,
  FIRST_COLOUR,
  FRAME_COLOURS,
  FRAME_COLOURS_NOT_SAVED,
  framePresetNames,
  HEX_COLOUR,
  PRESETS,
  SECOND_COLOUR,
  YOUR_OWN,
} from "./appearance-text.ts";
import type { SaveSetting } from "./save-setting.ts";

const frameOptions = [
  ...Object.entries(framePresetNames).map(([value, label]) => ({ value, label })),
  { value: "own", label: YOUR_OWN },
];

/** The frame colours' name in the dialog: "Blue and purple", or "Your own". */
function frameName(frame: FrameColours): string {
  return frame.preset === "own" ? YOUR_OWN : framePresetNames[frame.preset];
}

/** The props of {@link FrameColoursField}. */
export interface FrameColoursFieldProps {
  readonly settings: DisplaySettings;
  readonly save: SaveSetting;
}

/**
 * Settings → Appearance → Frame colours (flow-settings 5, UX checklist 3.8): a select of the four
 * presets and "Your own". Your own shows two colour fields side by side, which start from the
 * colours of the preset picked before. The frame changes at once; there is no separate preview.
 *
 * @example
 * <FrameColoursField settings={displaySettings} save={save} />
 */
export function FrameColoursField({ settings, save }: FrameColoursFieldProps) {
  const frame = useDisplaySetting(settings, frameColoursPref);
  const [first, second] = frameColourPair(frame.value);
  const saveFrame = (picked: FrameColours) =>
    save(frameColoursPref, picked, FRAME_COLOURS_NOT_SAVED, frameName);
  const saveOwn = (colours: FrameColourPair) => saveFrame({ preset: "own", colours });

  return (
    <>
      <Field label={FRAME_COLOURS} error={frame.failed ? FRAME_COLOURS_NOT_SAVED.line : null}>
        <Select
          options={frameOptions}
          value={frame.value.preset}
          onChange={(picked) =>
            picked === "own"
              ? saveOwn([first, second])
              : saveFrame(frameColoursPref.read({ preset: picked }) ?? frameColoursPref.fallback)
          }
        />
      </Field>
      {frame.value.preset === "own" ? (
        <div className="flex gap-4">
          <ColourField
            label={FIRST_COLOUR}
            which="first"
            colour={first}
            onColour={(colour) => saveOwn([colour, second])}
          />
          <ColourField
            label={SECOND_COLOUR}
            which="second"
            colour={second}
            onColour={(colour) => saveOwn([first, colour])}
          />
        </div>
      ) : null}
    </>
  );
}

interface ColourFieldProps {
  readonly label: string;
  readonly which: "first" | "second";
  /** The last good colour, which the swatch and the frame show: "#3B8BFF". */
  readonly colour: string;
  readonly onColour: (colour: string) => void;
}

/**
 * One colour of Your own, 172px wide: an Input whose swatch button opens the kit's colour
 * popover. A typed colour is taken when you leave the field or press Enter, in any case, with or
 * without `#`, and shows as `#3B8BFF`. Anything else says how to write one, once you leave, and
 * the swatch and the frame keep the last good colour.
 */
function ColourField({ label, which, colour, onColour }: ColourFieldProps) {
  const [text, setText] = useState(colour);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const swatch = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  // A pick in the popover, or a failed save putting the colour back, shows in the field.
  useEffect(() => {
    setText(colour);
    setError(null);
  }, [colour]);

  function take() {
    const typed = parseHex(text);
    if (typed === null) {
      setError(COLOUR_ERROR);
      return;
    }
    setError(null);
    setText(typed);
    if (typed !== colour) {
      onColour(typed);
    }
  }

  return (
    <div className="w-43">
      <Field label={label} error={error}>
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={take}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              take();
            }
          }}
          leadingButton={{
            label: chooseColour(which, colour),
            onClick: () => setOpen((shown) => !shown),
            expanded: open,
            controls: open ? popoverId : undefined,
            ref: swatch,
            children: (
              <span
                className="block size-4 rounded-sm border border-border-control"
                style={{ backgroundColor: colour }}
              />
            ),
          }}
        />
      </Field>
      <ColourPopover
        id={popoverId}
        open={open}
        opener={swatch}
        onClose={() => setOpen(false)}
        label={colourPopoverLabel(which)}
        presets={colourSwatches}
        value={colour}
        onChange={(picked) => {
          const pickedColour = parseHex(picked);
          if (pickedColour === null) {
            return;
          }
          // Even the colour it has: a pick replaces what's typed, and its error, at once.
          setText(pickedColour);
          setError(null);
          if (pickedColour !== colour) {
            onColour(pickedColour);
          }
        }}
        presetsLabel={PRESETS}
        hexLabel={HEX_COLOUR}
        hexError={COLOUR_ERROR}
      />
    </div>
  );
}
