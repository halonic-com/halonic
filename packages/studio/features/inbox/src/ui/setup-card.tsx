import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { SetupViewProps } from "../inbox.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { CardHeader } from "./card-parts.tsx";

/**
 * A setup item whose source has no view of its own: its title, which takes focus, its progress
 * line and **Not now**. A source's view, at the current step, takes its place
 * (`InboxSetupSource.view`).
 */
export function SetupCard({ item, close }: SetupViewProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 p-4">
      <CardHeader
        titleId={titleId}
        title={markedName(item.title)}
        heading={heading}
        since={markedName(item.progress)}
      />
      <div>
        <Button variant="secondary" onClick={close}>
          Not now
        </Button>
      </div>
    </section>
  );
}
