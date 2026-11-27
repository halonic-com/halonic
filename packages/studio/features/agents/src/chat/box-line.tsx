import type { ChatAction } from "@halonicjs/studio-kit";
import { ChatBoxLine } from "@halonicjs/studio-kit";
import type { ChatSecretHold } from "@halonicjs/studio-shell";
import type { AgentHarnessId, MissingModelKey } from "../api.ts";
import { configurationWords } from "../configuration/configuration-words.ts";
import type { HarnessStrip } from "../configuration/harness-strip.ts";
import { tryItWords } from "./try-it-words.ts";

/**
 * What stops a Try it message now, most urgent first: a message held because it looks like it
 * holds a key (H29), then the harness and the sandbox in harness-states rule 1's order (H27,
 * HAL-4291), then the month's budget used up (H21), then the model's missing key (H19).
 */
export type BoxProblem =
  | { readonly kind: "key-in-message"; readonly hold: ChatSecretHold }
  | { readonly kind: "harness"; readonly strip: HarnessStrip; readonly harness: AgentHarnessId }
  | { readonly kind: "sandbox" }
  | { readonly kind: "budget"; readonly line: string }
  | { readonly kind: "model-key"; readonly key: MissingModelKey };

/** What {@link boxProblem} weighs. */
export interface BoxState {
  /** The message's hold, when it looks like it holds a key: its line and its ways. */
  readonly held: ChatSecretHold | undefined;
  readonly harness: AgentHarnessId;
  /** The strip the harness check calls for, or `null` when the harness can run. */
  readonly strip: HarnessStrip | null;
  /**
   * The sandbox check refused, so the agent's program can't start on this computer, or its first
   * check hasn't answered while the agent host starts (HAL-19614).
   */
  readonly sandboxBlocks: boolean;
  /** The monthly budget's sentence while this month's spend has reached it. */
  readonly budgetReached: string | undefined;
  /** The agent's model, when it needs a key that isn't stored. */
  readonly missingKey: MissingModelKey | undefined;
}

/** The first problem that applies, or `undefined` when the message can go. */
export function boxProblem(state: BoxState): BoxProblem | undefined {
  if (state.held !== undefined) return { kind: "key-in-message", hold: state.held };
  if (state.strip !== null) return { kind: "harness", strip: state.strip, harness: state.harness };
  if (state.sandboxBlocks) return { kind: "sandbox" };
  if (state.budgetReached !== undefined) return { kind: "budget", line: state.budgetReached };
  if (state.missingKey !== undefined) return { kind: "model-key", key: state.missingKey };
  return undefined;
}

/**
 * Whether a problem makes Send wait, with the line under the box as its reason. A missing model
 * key doesn't: Send stays, so pressing it can find a key set since (flow-assistant 7). A changed
 * budget is a change of the workspace's files, so its line goes by itself.
 */
export function makesSendWait(problem: BoxProblem | undefined): boolean {
  return problem?.kind === "harness" || problem?.kind === "sandbox" || problem?.kind === "budget";
}

/** What the line's actions do; the page gives the ways to the other places. */
export interface BoxLineActions {
  /** Opens the workspace's page at Providers, where keys are kept. */
  readonly goToKeyField: () => void;
  /** Sends the held message once, as it is. */
  readonly sendAnyway: () => void;
  /** Opens Configuration › Harness. */
  readonly openHarness: () => void;
  /** Opens the key block of the provider whose key is stored under `secretName`. */
  readonly setTheKey: (secretName: string) => void;
  /** Opens Workspace settings at its Budget block; absent where the page can't. */
  readonly changeBudget?: (() => void) | undefined;
}

/**
 * The line under the Try it box for `problem` (microcopy 8.3), in `warning`. A harness that isn't
 * ready also makes Send wait, with this line as its reason; a held key leaves Send as it is, so
 * pressing it again sends nothing until the text changes or **Send anyway**. A Google client
 * secret has no way to the key field, which is for other keys. The budget's line is the Inbox's
 * notice word for word, with **Change budget** where the page can open the budget.
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
  switch (problem.kind) {
    case "key-in-message":
      return <HeldMessageLine hold={problem.hold} actions={actions} />;
    case "model-key":
      return <ModelKeyLine missing={problem.key} name={name} setTheKey={actions.setTheKey} />;
    case "budget":
      return <BudgetLine line={problem.line} changeBudget={actions.changeBudget} />;
    case "harness":
      return (
        <ChatBoxLine
          tone="warning"
          actions={[{ label: tryItWords.openHarness, onClick: actions.openHarness, look: "link" }]}
        >
          {harnessSentence(problem.strip, name, configurationWords.harnessNames[problem.harness])}
        </ChatBoxLine>
      );
  }
}

function HeldMessageLine({
  hold,
  actions,
}: {
  readonly hold: ChatSecretHold;
  readonly actions: BoxLineActions;
}) {
  const keyField: ChatAction[] = hold.keyField
    ? [{ label: tryItWords.goToKeyField, onClick: actions.goToKeyField, look: "link" }]
    : [];
  const offers: ChatAction[] = [
    ...keyField,
    { label: tryItWords.sendAnyway, onClick: actions.sendAnyway },
  ];
  return (
    <ChatBoxLine tone="warning" actions={offers}>
      {hold.line}
    </ChatBoxLine>
  );
}

/** H21: the month's budget used up, as the Inbox's notice says it. */
function BudgetLine({
  line,
  changeBudget,
}: {
  readonly line: string;
  readonly changeBudget: (() => void) | undefined;
}) {
  const change: ChatAction[] =
    changeBudget === undefined ? [] : [{ label: tryItWords.changeBudget, onClick: changeBudget }];
  return (
    <ChatBoxLine tone="warning" actions={change}>
      {line}
    </ChatBoxLine>
  );
}

/** H19, as the Assistant's model line says it, with the model's name as code. */
function ModelKeyLine({
  missing,
  name,
  setTheKey,
}: {
  readonly missing: MissingModelKey;
  readonly name: string;
  readonly setTheKey: (secretName: string) => void;
}) {
  const link: ChatAction = {
    label: tryItWords.setTheKey,
    onClick: () => setTheKey(missing.secretName),
    look: "link",
  };
  return (
    <ChatBoxLine tone="warning" actions={[link]}>
      {tryItWords.noUsableModel(name)} <code>{missing.model}</code>{" "}
      {tryItWords.needsKey(missing.provider)}
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
