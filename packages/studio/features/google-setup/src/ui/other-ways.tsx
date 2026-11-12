import { Button, ChevronDownIcon, ChevronRightIcon } from "@halonicjs/studio-kit";
import { useState } from "react";

/** Props for {@link OtherWays}. */
export interface OtherWaysProps {
  /** The ticked services' names, as "Gmail and Drive": what Google needs the app for. */
  readonly services: string;
}

/**
 * The route line's second half: **Other ways (later)** opens a panel with no buttons. It is a
 * disclosure, so `aria-expanded` follows it and Enter and Space toggle it.
 */
export function OtherWays({ services }: OtherWaysProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-expanded={open}
        icon={open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        onClick={() => setOpen(!open)}
      >
        Other ways (later)
      </Button>
      {open ? (
        <div className="flex basis-full flex-col gap-2 text-body text-fg-muted">
          <p>
            <strong className="text-body-strong text-fg">Why your own app?</strong> Google requires
            every app that reads your {services} to be registered. With your own app, you register
            it yourself in Google Cloud, once, in about 15 minutes. Your data goes straight from
            Google to this computer.
          </p>
          <p className="text-body-strong text-fg">Later:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong className="text-body-strong text-fg">Halonic's app.</strong> Nothing to set
              up: you sign in, and that's it. It comes once Google has reviewed Halonic's app.
            </li>
            <li>
              <strong className="text-body-strong text-fg">Halonic Cloud.</strong> Your workflows
              run while this computer is off. Planned, with no price yet.
            </li>
          </ul>
        </div>
      ) : null}
    </>
  );
}
