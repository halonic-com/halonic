import { deviceCrop, type Rect, type Screen, sizeLabel, sizeLabelPlacement } from "../crop.ts";
import { pill } from "./overlay-colours.ts";

/** Gap between the box's corner and the label, in CSS pixels. */
const gap = 4;

/**
 * The label is drawn after it is placed, so its size is an estimate: about 7.5px per character
 * of 12px mono text, plus its padding. Close enough to tell whether it fits below the box.
 */
function labelSize(text: string) {
  return { width: text.length * 7.5 + 12 + gap, height: 20 + gap };
}

/**
 * The box's size in the crop's device pixels, such as "640 × 330", below its bottom-right corner,
 * or inside the box when it would leave the screen there (`feedback.crop`).
 */
export function SizeLabel({ screen, box }: { readonly screen: Screen; readonly box: Rect }) {
  const text = sizeLabel(deviceCrop(screen, box));
  const inside = sizeLabelPlacement(screen, box, labelSize(text)) === "inside";
  const bottom = box.y + box.height;
  return (
    <span
      className="absolute -translate-x-full rounded px-1.5 py-0.5 font-mono text-caption whitespace-nowrap"
      data-feedback-size=""
      style={{
        ...pill,
        left: box.x + box.width - (inside ? gap : 0),
        top: inside ? bottom - labelSize(text).height : bottom + gap,
      }}
    >
      {text}
    </span>
  );
}
