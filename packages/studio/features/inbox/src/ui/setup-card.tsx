import { useEffect, useId, useRef } from "react";
import type { SetupItem } from "../inbox-items.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { CardHeader } from "./card-parts.tsx";

/**
 * A setup item while the Inbox has no view of its source's: its title, which takes focus, and its
 * progress line. The source's own view, at the current step, replaces it (HAL-711 PR 2).
 */
export function SetupCard({ item }: { readonly item: SetupItem }) {
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
    </section>
  );
}
