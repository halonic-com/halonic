import type { OverviewItem } from "./overview-model.ts";

/**
 * A phone row that asks for {@link OverviewItem.chipsBeforeUsedBy}: the detail on up to two lines,
 * then the chips and the used-by text on a last line of their own, which wraps rather than cuts.
 */
export function DetailThenLastLine({ item }: { readonly item: OverviewItem }) {
  const hasLastLine = item.chips !== undefined || item.usedBy !== undefined;
  return (
    <>
      {item.detail === undefined ? null : (
        <span className="line-clamp-2 block whitespace-normal wrap-break-word">{item.detail}</span>
      )}
      {hasLastLine && (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal">
          {item.chips}
          {item.usedBy === undefined ? null : <span className="min-w-0">{item.usedBy}</span>}
        </span>
      )}
    </>
  );
}
