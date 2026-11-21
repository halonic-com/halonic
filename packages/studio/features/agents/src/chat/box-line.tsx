import type { ChatAction } from "@halonicjs/studio-kit";
import { ChatBoxLine } from "@halonicjs/studio-kit";
import type { AgentHarnessId } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { tryItWords } from "./try-it-words.ts";

/**
 * What stops a Try it message now, most urgent first: a message held because it looks like it
 * holds a key (H29), then the harness and the sandbox in harness-states rule 1's order (H27,
 * HAL-4291). Signed out, the model's key (H19) and the budget (H21) join this list as their checks
 * land.
 */
export type BoxProblem =
  | { readonly kind: "key-in-message" }
  | { readonly kind: "harness"; readonly strip: HarnessStrip; readonly harness: AgentHarnessId }
  | { readonly kind: "sandbox" };

/** What {@link boxProblem} weighs. */
export interface BoxState {
  /** The message was held because it looks like it holds a key. */
  readonly heldForKey: boolean;
  readonly harness: AgentHarnessId;
  /** The strip the harness check calls for, or `null` when the harness can run. */
  readonly strip: HarnessStrip | null;
  /** The sandbox check refused: the agent's program can't start on this computer. */
  readonly sandboxRefused: boolean;
}

/** The first problem that applies, or `undefined` when the message can go. */
export function boxProblem(state: BoxState): BoxProblem | undefined {
  if (state.heldForKey) return { kind: "key-in-message" };
  if (state.strip !== null) return { kind: "harness", strip: state.strip, harness: state.harness };
  if (state.sandboxRefused) return { kind: "sandbox" };
  return undefined;
}

/** Whether a problem makes Send wait, with the line under the box as its reason. */
export function makesSendWait(problem: BoxProblem | undefined): boolean {
  return problem?.kind === "harness" || problem?.kind === "sandbox";
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
  readonly problem: Exclude<BoxProblem, { readonly kind: "sandbox" }>;
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
  const sentence = harnessSentence(
    problem.strip,
    name,
    configurationWords.harnessNames[problem.harness],
  );
  return (
    <ChatBoxLine
      tone="warning"
      actions={[{ label: tryItWords.openHarness, onClick: actions.openHarness, look: "link" }]}
    >
      {sentence}
    </ChatBoxLine>
  );
}

/** The Harness page strip's sentence for `strip`, so the chat and the page say the same. */
function harnessSentence(strip: HarnessStrip, agent: string, program: string): string {
  switch (strip) {
    case "not-installed":
      return configurationWords.stripNotInstalled(agent, program);
    case "too-old":
      return configurationWords.stripTooOld(agent, program);
    case "signed-out":
      return configurationWords.stripSignedOut(agent, program);
  }
}
