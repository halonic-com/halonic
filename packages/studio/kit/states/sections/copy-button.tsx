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
    <span ref={holder} className="inline-flex flex-wrap items-center gap-2">
      <code className="rounded-xs bg-surface-muted px-1.5 py-0.5 font-mono text-small">
        {command}
      </code>
      <CopyButton text={command} label="Copy the command" />
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
