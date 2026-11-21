// The words of the Pick a model screen, from first-run-flow 3.3, 6 and 8e. The
// lines 3.3 doesn't word (a file that stops the choice, a failed save, the
// local check under way) were decided by the team on HAL-13432.

import { type FirstRunKeyProvider, firstRunProviders } from "@halonicjs/app";
import type { ModelChoiceLine } from "../api.ts";
import type { LocalState, PickBusy, PickButton, PickMessage } from "./pick-model-state.ts";

/** The fixed words of the screen. */
export const pickModelWords = {
  heading: "Pick a model",
  intro: "The agents need a model to think with. Choose one.",
  key: "Use a key from a provider",
  keyNote: "Anthropic, OpenAI or Gemini",
  keyPlaceholder: "Paste your key here",
  provider: "Provider",
  keyField: "Key",
  keyKept: "Kept encrypted on this computer. Studio never shows it again.",
  noKey: "Don't have a key?",
  needsAccount: "(needs an account with them)",
  replace: "Replace",
  cost: "A run costs your own account a small amount. Studio shows the cost after the run.",
  keysOff: "Keys need the desktop app.",
  local: "Use a model on this computer",
  localFree: "Free, nothing leaves this computer.",
  localOff: "Local models need the desktop app.",
  model: "Model",
  pullHint: "Download a small model first, in a terminal. Then check again.",
  startHint: "Start Ollama, then check again.",
  copyCommand: "Copy command",
  pullCommand: "ollama pull llama3.2",
  sample: "Just show me, with Sample answers",
  sampleHint: "No key and no account. The answers are scripted, not from a real model.",
  sampleNote:
    "The run and its Inbox card will carry a Sample answers label, so nobody takes it for a real model. Add a key or a local model later to use a real one.",
  back: "Back",
  loadingHint: "The first time can take a minute.",
  slowHint: "Still loading. Bigger models take longer the first time.",
} as const;

/** Each key provider's page for making a key, for "Get one from … ↗". */
export const keyPages: Readonly<Record<FirstRunKeyProvider, string>> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
};

/** "Get one from Anthropic", to which the external link adds its ↗. */
export function getKeyLink(provider: FirstRunKeyProvider): string {
  return `Get one from ${firstRunProviders[provider].name}`;
}

/** "A key is saved for Anthropic". */
export function keySavedLine(provider: FirstRunKeyProvider): string {
  return `A key is saved for ${firstRunProviders[provider].name}`;
}

/** "Agents will use llama3.2 on this computer.", under a found model. */
export function localUseLine(model: string): string {
  return `Agents will use ${model} on this computer.`;
}

/** The one button's label: what it does, or what it waits for. */
export function buttonLabel(button: PickButton, busy: PickBusy | undefined): string {
  if (busy?.kind === "testing-key") return "Testing…";
  if (busy?.kind === "loading-local") return "Loading the model…";
  if (busy?.kind === "checking") return "Checking…";
  if (busy?.kind === "saving") return "Saving…";
  if (button === "check-again") return "Check again";
  return button === "continue" ? "Continue" : "Test and continue";
}

/** The local option's state line (3.3's table, as Noah's sheet 01 words it). */
export function localLine(local: LocalState): string {
  switch (local.kind) {
    case "desktop-only":
      return pickModelWords.localOff;
    case "checking":
      return "Looking for a model on this computer…";
    case "one":
      return `Found Ollama · ${local.model}`;
    case "several":
      return `Found Ollama · ${local.models.length} models downloaded`;
    case "none-downloaded":
      return "Ollama is running, but has no model yet.";
    case "not-found":
      return "No model found on this computer.";
  }
}

/**
 * The trust line under the button (3.3, 10.2 R4): "Will pass 1 secret to
 * Anthropic. Turns off Local only." or "Will reach Ollama at localhost:11434".
 * `undefined` when the choice adds no provider and leaves Local only on.
 */
export function trustLine(line: ModelChoiceLine): string | undefined {
  const turnsOff = line.localOnlyOff ? "Turns off Local only." : undefined;
  const { reaches } = line;
  if (reaches === undefined) return turnsOff;
  const secrets = reaches.secrets === 1 ? "1 secret" : `${reaches.secrets} secrets`;
  const first =
    reaches.local && reaches.host !== undefined
      ? `Will reach ${reaches.name} at ${reaches.host}`
      : `Will pass ${secrets} to ${reaches.name}.`;
  return turnsOff === undefined ? first : `${first} ${turnsOff}`;
}

/** Whether a message is amber (the choice is fine, but don't continue) rather than red (8b.10, 8e.4). */
export function isAmber(message: PickMessage): boolean {
  return (
    message.kind === "line-changed" ||
    (message.kind === "tested" &&
      (message.outcome === "no-credit" || message.outcome === "local-not-usable"))
  );
}

/** What the screen says after the button, in plain words; `provider` names the key's provider. */
export function messageText(message: PickMessage, provider: FirstRunKeyProvider): string {
  const name = firstRunProviders[provider].name;
  switch (message.kind) {
    case "not-a-key":
      return `That doesn't look like a key. It usually starts with ${message.problem.keyStart}`;
    case "files":
      return message.problem.kind === "unreadable"
        ? `Studio can't read ${message.problem.file}. Fix it, or pick another option.`
        : `This workspace already has its own ${message.problem.file}, and Studio won't change a file you set up. Pick another option.`;
    case "tested":
      return testedText(message.outcome, name);
    case "line-changed":
      return "What Continue allows has changed. Check the line below, then press Continue.";
    case "not-saved":
      return notSavedText(message.failed, message.keySaved);
    case "broke":
      return message.step === "save"
        ? "Studio couldn't save this choice. Try again."
        : "Studio couldn't test this choice. Try again.";
  }
}

function testedText(
  outcome: Extract<PickMessage, { kind: "tested" }>["outcome"],
  name: string,
): string {
  switch (outcome) {
    case "key-refused":
      return `${name} didn't accept this key. Check that you copied all of it.`;
    case "no-credit":
      return `The key works, but your account has no credit or is over its limit. Add credit on ${name}'s site, then test again.`;
    case "offline":
      return `Studio can't reach ${name}. Check your connection.`;
    case "provider-error":
      return `${name} isn't answering right now. Try again in a minute.`;
    case "local-not-answering":
      return "The model on this computer didn't answer. Check that Ollama is running, then test again.";
    case "local-not-usable":
      return "This model answered, but not in a form the workflow can use. It may be too small. Try a larger one, or use Sample answers.";
  }
}

function notSavedText(
  failed: Extract<PickMessage, { kind: "not-saved" }>["failed"],
  keySaved: boolean,
): string {
  if (failed === "no-test") return "The test is out of date. Test again.";
  if (failed === "files") return "A workspace file changed and now stops this choice. Test again.";
  if (failed === "key")
    return "Studio couldn't keep the key on this computer. Nothing changed. Try again.";
  if (failed === "no-save") return "Nothing can be saved here. Use Sample answers.";
  const kept = keySaved ? " The key is kept on this computer." : "";
  return `Studio couldn't save the change to the workspace's files.${kept} Try again.`;
}
