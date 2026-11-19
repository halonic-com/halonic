import { Button } from "../button/button.tsx";
import { useWait } from "../list/list-skeleton.tsx";
import { SkeletonBar, type SkeletonBarWidth } from "../skeleton-bar/skeleton-bar.tsx";

/** The props of `ChatLoading`. */
export interface ChatLoadingProps {
  /** What the status line says once the lines show: "Loading this chat". */
  readonly label: string;
  /** Try again, offered after 10 seconds. */
  readonly onRetry: () => void;
}

/** Three lines of a reply, a little different in width. Fixed, so screenshots are stable. */
const lineWidths: readonly SkeletonBarWidth[] = ["7/10", "full", "2/5"];

/**
 * A chat's transcript while it first loads (states H7, D3): nothing for 300ms, so a fast load
 * doesn't flash, then three still skeleton lines, hidden from screen readers, which hear the
 * status line instead. After 10 seconds "Still loading" and **Try again** show under the lines.
 * A chat already shown in this session opens at once, so the feature doesn't render this then.
 *
 * The status line sits next to the `aria-busy` block, not in it, as in the List: a screen reader
 * may hold back changes inside a busy element until it's done.
 *
 * @example
 * <ChatLoading label="Loading this chat" onRetry={load} />
 */
export function ChatLoading({ label, onRetry }: ChatLoadingProps) {
  const wait = useWait();
  const status = { early: "", showing: label, slow: "Still loading" }[wait];
  return (
    <div className="mx-auto flex w-full max-w-reading flex-col gap-4 px-4 py-4">
      {/* There from the start, so screen readers announce the text when it arrives. */}
      <span role="status" className="sr-only">
        {status}
      </span>
      <div aria-busy="true" className="flex flex-col gap-3">
        {wait === "early"
          ? null
          : lineWidths.map((width) => (
              <div key={width} aria-hidden="true">
                <SkeletonBar kind="title" width={width} />
              </div>
            ))}
      </div>
      {wait === "slow" ? (
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="text-small text-fg-muted">
            Still loading
          </span>
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
