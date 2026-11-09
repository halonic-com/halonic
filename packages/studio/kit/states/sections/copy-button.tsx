import { useEffect, useRef } from "react";
import { COPIED_FOR_MS, CopyButton } from "../../src/copy-button/copy-button.tsx";
import type { PartSection } from "../state-table.tsx";

const command = "studio serve --port 4310";

/**
 * How the clipboard answers a click the page makes for a row. `copied` keeps clicking before
 * "Copied" runs out, so the row holds it; `failed` refuses both ways of copying, once.
 */
type Outcome = "copied" | "failed";

/**
 * Clicks the real button with a stand-in clipboard, so the row shows the part's own "Copied" or
 * its error. The stand-ins are on for the click only: copyText settles within the click's
 * microtasks, before the timer that takes them away.
 */
function useClickedCopy(outcome: Outcome | undefined) {
  const holder = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const button = holder.current?.querySelector("button");
    if (outcome === undefined || button === null || button === undefined) {
      return;
    }
    const click = () => {
      const clipboard = {
        writeText: () => (outcome === "copied" ? Promise.resolve() : Promise.reject(new Error())),
      };
      Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
      Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
      button.click();
      setTimeout(() => {
        Reflect.deleteProperty(navigator, "clipboard");
        Reflect.deleteProperty(document, "execCommand");
      });
    };
    click();
    if (outcome === "failed") {
      return;
    }
    const timer = setInterval(click, COPIED_FOR_MS / 2);
    return () => clearInterval(timer);
  }, [outcome]);

  return holder;
}

/** The command and its CopyButton, as on a connect page. */
function CommandWithCopy({ outcome }: { readonly outcome?: Outcome }) {
  const holder = useClickedCopy(outcome);
  return (
    // The button stays beside the command; in the Error row its hint goes on the line below.
    <span ref={holder} className="flex items-start gap-2">
      <code className="inline-flex h-control-sm shrink-0 items-center whitespace-nowrap rounded-sm border border-border bg-surface-muted px-2.5 font-mono text-small touch:h-control-lg phone:h-touch">
        {command}
      </code>
      {/* Only the hint wraps, so the command keeps its one line. */}
      <span className="min-w-0">
        <CopyButton text={command} label="Copy the command" />
      </span>
    </span>
  );
}

export const copyButtonSection: PartSection = {
  id: "copy-button",
  number: "25.1",
  name: "CopyButton",
  order: "25.1 · next to the command it copies",
  notApplicable: "disabled, read-only",
  rows: [
    { name: "Default", copies: () => <CommandWithCopy /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <CommandWithCopy /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <CommandWithCopy /> },
    { name: "Copied", copies: () => <CommandWithCopy outcome="copied" /> },
    { name: "Error", copies: () => <CommandWithCopy outcome="failed" /> },
  ],
};
