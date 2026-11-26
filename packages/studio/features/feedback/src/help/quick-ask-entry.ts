import { type AskOpener, AskOpenerService } from "@halonicjs/studio-feature-quick-ask/api";
import type { CommandContribution, HelpItem, ServiceLookup } from "@halonicjs/studio-shell";
import { AskKeysTextService } from "../api.ts";
import { quickAskEntry } from "../settings/settings-words.ts";

/** The Ctrl K entry's id, under the `feedback.shortcuts` source. */
export const quickAskCommand = "feedback.shortcuts.quick-ask";

/**
 * Help › Quick ask (`feedback.help-quick-ask`): "Quick ask (Ctrl+Alt+Space)", or plain "Quick ask"
 * while its keys don't work, showing the box. None where the app gives no opener, such as the
 * served Studio or any window but Studio's own.
 */
export function quickAskHelpItems(services: ServiceLookup): readonly HelpItem[] {
  const opener = services.find(AskOpenerService);
  if (opener === undefined) return [];
  return [{ id: "quick-ask", label: titleOf(services), run: () => openBox(opener) }];
}

/**
 * The same entry in Ctrl K. Its run rejects with the shell's refusal, which the palette reports.
 * Desktop only: a phone has no box.
 */
export function quickAskCommands(services: ServiceLookup): readonly CommandContribution[] {
  const opener = services.find(AskOpenerService);
  if (opener === undefined) return [];
  return [
    { id: quickAskCommand, title: titleOf(services), phone: false, run: () => opener.open() },
  ];
}

function titleOf(services: ServiceLookup): string {
  return quickAskEntry(services.find(AskKeysTextService)?.current());
}

/** Shows the box; Help has nowhere to say a refusal, so the console says it. */
function openBox(opener: AskOpener): void {
  opener.open().catch((error: unknown) => console.error("Quick ask's box didn't open:", error));
}
