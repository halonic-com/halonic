import { Button } from "@halonicjs/studio-kit";

/**
 * One quiet line where a part of the page would be, with **Try again**: "Couldn't load the
 * workflows you can start." The region is a status, so the line is read out when it appears.
 *
 * @example
 * <QuietLine line="Couldn't load the workflows you can start." retry={retry} />
 */
export function QuietLine({ line, retry }: { readonly line: string; readonly retry: () => void }) {
  return (
    <p
      role="status"
      className="flex flex-wrap items-center gap-2 px-4 py-1 text-body text-fg-muted"
    >
      {line}
      <Button variant="ghost" size="sm" onClick={retry}>
        {TRY_AGAIN}
      </Button>
    </p>
  );
}

/** The button of a quiet line (microcopy 1.1). */
export const TRY_AGAIN = "Try again";
