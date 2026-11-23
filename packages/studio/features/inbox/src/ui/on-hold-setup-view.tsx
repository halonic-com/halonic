import { markHiddenName } from "@halonicjs/std";
import { Button } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef } from "react";
import type { OnHoldViewProps } from "../sandbox/on-hold-setup-source.ts";
import { onHoldInboxWords, sandboxInboxWords } from "../sandbox/sandbox-words.ts";
import { CardHeader } from "./card-parts.tsx";

/**
 * The on-hold row's card (requirement `inbox.on-hold-row`, checklist 3.8): its title, which takes
 * focus, the line under it, **Review and confirm**, which opens the agent's Where it runs, and
 * **Not now**. Once the agent isn't on hold any more the card says "Fixed" and drops **Review and
 * confirm**: there is nothing left to confirm. Without a way to open a page there is no button.
 */
export function OnHoldSetupView({ item, close, openItem, review }: OnHoldViewProps) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const fixed = item.fixed === true;
  const target = fixed || openItem === undefined ? undefined : review(item.account);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 p-4">
      <CardHeader
        titleId={titleId}
        title={markHiddenName(item.title)}
        heading={heading}
        since={fixed ? sandboxInboxWords.fixed : null}
      />
      <p className="text-body">{markHiddenName(item.progress)}</p>
      <div className="flex flex-wrap gap-2">
        {target === undefined ? null : (
          <Button variant="primary" onClick={() => openItem?.(target.item, target.options)}>
            {onHoldInboxWords.review}
          </Button>
        )}
        <Button variant="secondary" onClick={close}>
          Not now
        </Button>
      </div>
    </section>
  );
}
