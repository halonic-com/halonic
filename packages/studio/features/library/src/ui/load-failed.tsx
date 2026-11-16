import { Callout } from "@halonicjs/studio-kit";
import { engineWordsOf, type ItemViewProps } from "@halonicjs/studio-shell";

interface LoadFailedProps {
  readonly title: string;
  /** Why the first read failed, in words for the user; absent when the error has none. */
  readonly reason: string | undefined;
  readonly retryLabel: string;
  readonly context: ItemViewProps["context"];
  readonly onRetry: () => void;
}

/** What a page shows when its first read failed and nothing has loaded: the reason, and Try again. */
export function LoadFailed({ title, reason, retryLabel, context, onRetry }: LoadFailedProps) {
  return (
    <div className="px-4 py-5">
      <Callout tone="danger" title={title} action={{ label: retryLabel, onClick: onRetry }}>
        {/* A load that fails without a reason never reached the engine: say that, never nothing. */}
        {reason ?? engineWordsOf(context).notAnswering}
      </Callout>
    </div>
  );
}
