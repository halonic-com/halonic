import { Button } from "@halonicjs/studio-kit";
import { useRef } from "react";

/**
 * **Review** on a line that says the workspace isn't trusted yet, on an approval's, a wait step's or
 * a proposal's card: opens the trust check with itself as the opener, so focus comes back to it.
 */
export function ReviewTrustButton({
  review,
}: {
  readonly review: (opener: HTMLElement | null) => void;
}) {
  const button = useRef<HTMLButtonElement | null>(null);
  return (
    <Button ref={button} variant="ghost" size="sm" onClick={() => review(button.current)}>
      Review
    </Button>
  );
}
