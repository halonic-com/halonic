import { Fragment } from "react";

/**
 * A phone line with `**Bold**` around the name of a control or place, as the strings table writes
 * it: the marked parts render semi-bold, the marks themselves never show.
 */
export function MarkedText({ text }: { readonly text: string }) {
  const parts = text.split("**");
  return (
    <>
      {parts.map((part, index) =>
        // Odd parts sit between a pair of marks. The parts never reorder, so the index is the key.
        index % 2 === 1 ? (
          <strong key={index} className="font-semibold">
            {part}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}
