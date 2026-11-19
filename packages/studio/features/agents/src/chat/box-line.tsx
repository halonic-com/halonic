import type { ChatAction } from "@halonicjs/studio-kit";
import { ChatBoxLine } from "@halonicjs/studio-kit";
import type { AgentHarnessId } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { tryItWords } from "./try-it-words.ts";

/**
 * What stops a Try it message now, most urgent first: a message held because it looks like it
 * holds a key (H29), then the harness in harness-states rule 1's order (H27). Signed out, the
 * sandbox, the model's key (H19) and the budget (H21) join this list as their checks land.
 */
export type BoxProblem =
  | { readonly kind: "key-in-message" }
  | { readonly kind: "harness"; readonly strip: HarnessStrip; readonly harness: AgentHarnessId };

/** The first problem that applies, or `undefined` when the message can go. */
export function boxProblem(
  heldForKey: boolean,
  harness: AgentHarnessId,
  strip: HarnessStrip | null,
): BoxProblem | undefined {
  if (heldForKey) return { kind: "key-in-message" };
  if (strip !== null) return { kind: "harness", strip, harness };
  return undefined;
}

/** What the line's actions do; the page gives the ways to the other places. */
export interface BoxLineActions {
  /** Opens the workspace's page at Providers, where keys are kept. */
  readonly goToKeyField: () => void;
  /** Sends the held message once, as it is. */
  readonly sendAnyway: () => void;
  /** Opens Configuration › Harness. */
  readonly openHarness: () => void;
}

/**
 * The line under the Try it box for `problem` (microcopy 8.3), in `warning`. A harness that isn't
 * ready also makes Send wait, with this line as its reason; a held key leaves Send as it is, so
 * pressing it again sends nothing until the text changes or **Send anyway**.
 */
export function TryItBoxLine({
  problem,
  name,
  actions,
}: {
  readonly problem: BoxProblem;
  readonly name: string;
  readonly actions: BoxLineActions;
}) {
  if (problem.kind === "key-in-message") {
    const offers: ChatAction[] = [
      { label: tryItWords.goToKeyField, onClick: actions.goToKeyField, look: "link" },
      { label: tryItWords.sendAnyway, onClick: actions.sendAnyway },
    ];
    return (
      <ChatBoxLine tone="warning" actions={offers}>
        {tryItWords.keyInMessage}
      </ChatBoxLine>
    );
  }
  const program = configurationWords.harnessNames[problem.harness];
  const sentence =
    problem.strip === "not-installed"
      ? configurationWords.stripNotInstalled(name, program)
      : configurationWords.stripTooOld(name, program);
  return (
    <ChatBoxLine
      tone="warning"
      actions={[{ label: tryItWords.openHarness, onClick: actions.openHarness, look: "link" }]}
    >
      {sentence}
    </ChatBoxLine>
  );
}
