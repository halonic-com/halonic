import { Button } from "@halonicjs/studio-kit";
import type { RefObject } from "react";
import { sizeLabel } from "../crop.ts";
import { feedbackWords } from "../feedback-words.ts";
import type { StillImage } from "../overlay/still.ts";
import type { StillState } from "../overlay/use-still.ts";
import { breathe, useShownAfterWait } from "./show-after.ts";

/** The crop's box in the window: the dialog's 560px less its padding, and 220px high. */
const cropBox = { width: 512, height: 220 };

/** A zero-width space: it gives the size line its height while it has no size to show. */
const lineHeight = String.fromCharCode(0x200b);

/** Props for {@link CropView}. */
export interface CropViewProps {
  readonly canvas: RefObject<HTMLCanvasElement | null>;
  readonly still: StillState;
  /** While the feedback is being sent, Select again hides (Noah's design on HAL-19384). */
  readonly sending: boolean;
  /** Closes the window, keeping the text, for a new selection; without it there's no Select again. */
  readonly onSelectAgain: (() => void) | undefined;
  /** Sends the text alone, for a crop that couldn't be loaded. */
  readonly onSendWithoutScreenshot: () => void;
}

/**
 * The crop, fitted in its box, and its size under it. While the crop loads, the box shows the skeleton fill after 300 ms and the size line keeps its height, so
 * nothing moves when the crop fades in; when it can't be loaded, the box says so.
 */
export function CropView(props: CropViewProps) {
  const { canvas, still } = props;
  const selectAgain = props.sending ? undefined : props.onSelectAgain;
  const ready = still.kind === "ready" ? still.still : undefined;
  return (
    // Close together, so the size reads as the crop's caption.
    <div className="flex flex-col gap-2">
      <div
        className="flex shrink-0 items-center justify-center rounded-md bg-surface-subtle"
        style={{ height: cropBox.height }}
        aria-busy={still.kind === "loading" || undefined}
        data-feedback-crop=""
      >
        {still.kind === "loading" ? <CropSkeleton /> : null}
        {still.kind === "failed" ? (
          <CropFailed
            onSelectAgain={selectAgain}
            onSendWithoutScreenshot={props.onSendWithoutScreenshot}
          />
        ) : null}
        <canvas
          ref={canvas}
          // Fades in over the kit's 120 ms once drawn; a fade is kept under reduced motion too.
          className={ready === undefined ? "hidden" : "transition-opacity starting:opacity-0"}
          style={ready === undefined ? undefined : fittedSize(ready)}
        />
      </div>
      <p className="font-mono text-caption text-fg-muted" data-feedback-size="">
        {ready === undefined ? lineHeight : sizeLabel({ x: 0, y: 0, ...ready })}
      </p>
    </div>
  );
}

/** The skeleton fill over the whole box, after 300 ms, breathing three times. */
function CropSkeleton() {
  const shown = useShownAfterWait(true);
  if (!shown) return null;
  return (
    <span
      ref={breathe}
      aria-hidden="true"
      // The skeleton fill of the kit's SkeletonBar; the transparent edge stays in high contrast.
      className="block size-full rounded-md border border-transparent bg-surface-muted"
      data-feedback-crop-skeleton=""
    />
  );
}

/** "Couldn't load the screenshot." with Select again and Send without a screenshot. */
function CropFailed({
  onSelectAgain,
  onSendWithoutScreenshot,
}: {
  readonly onSelectAgain: (() => void) | undefined;
  readonly onSendWithoutScreenshot: () => void;
}) {
  return (
    // Nothing turns red: nothing typed was lost.
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-small text-fg-muted">{feedbackWords.cropFailed}</p>
      <div className="flex gap-2">
        {onSelectAgain === undefined ? null : (
          <Button variant="secondary" size="sm" onClick={onSelectAgain}>
            {feedbackWords.selectAgain}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onSendWithoutScreenshot}>
          {feedbackWords.sendWithoutScreenshot}
        </Button>
      </div>
    </div>
  );
}

/** The crop at its own size in CSS pixels, shrunk to fit its box and never stretched. */
function fittedSize(crop: StillImage): { width: number; height: number } {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = crop.width / pixelRatio;
  const height = crop.height / pixelRatio;
  const scale = Math.min(1, cropBox.width / width, cropBox.height / height);
  return { width: width * scale, height: height * scale };
}
