import { Callout } from "@halonicjs/studio-kit";
import { TRY_AGAIN } from "./alias-text.ts";

/** The props of {@link SaveFailed}. */
export interface SaveFailedProps {
  /** "Couldn't save the budget: the disk is full."; nothing is shown while it is `undefined`. */
  readonly line: string | undefined;
  /** Makes the same save again. */
  readonly retry: () => void | Promise<void>;
}

/**
 * A save of the Models files that failed, in the microcopy's *Action failed* shape (1.1): the line
 * and **Try again** (states audit gap 5). The status region is always there, so the line is read
 * out when it appears.
 *
 * @example
 * <SaveFailed line={failed} retry={() => save()} />
 */
export function SaveFailed({ line, retry }: SaveFailedProps) {
  return (
    <div role="status">
      {line === undefined ? null : (
        <Callout tone="danger" action={{ label: TRY_AGAIN, onClick: retry }}>
          {line}
        </Callout>
      )}
    </div>
  );
}
