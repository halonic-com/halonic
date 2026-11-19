import { Callout, type CalloutAction, CommandBox, ExternalLink } from "@halonicjs/studio-kit";
import { useState } from "react";
import type { AgentHarnessId, AgentRef, AgentsHost } from "../api.ts";
import { configurationWords as words } from "./configuration-words.ts";
import {
  type HarnessCheck,
  type HarnessStrip,
  harnessSetupPages,
  harnessStrip,
} from "./harness-strip.ts";

/** A program the strip can be about: Halonic's own loop never shows one. */
type ProgramId = Exclude<AgentHarnessId, "halonic">;

/** Props for {@link HarnessStripCallout}. */
export interface HarnessStripCalloutProps {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The agent's name, as the strip says it. */
  readonly name: string;
  readonly harness: AgentHarnessId;
  readonly found: HarnessCheck | undefined;
  /** Asks the host again, as the page's own Check again does. */
  readonly check: () => Promise<void>;
}

/** What the last Sign in for this agent left to say; nothing when a terminal opened. */
type SignInOutcome =
  | { readonly kind: "not-opened"; readonly command: string }
  | { readonly kind: "failed"; readonly reason: string };

/** The strip's words, and for a program that isn't there or is too old, where to get it. */
function stripWords(strip: HarnessStrip, name: string, harness: ProgramId) {
  const program = words.harnessNames[harness];
  const setup = harnessSetupPages[harness];
  switch (strip) {
    case "not-installed":
      return (
        <>
          {words.stripNotInstalled(name, program)} ·{" "}
          <ExternalLink href={setup}>{words.howToInstall}</ExternalLink>
        </>
      );
    case "too-old":
      return (
        <>
          {words.stripTooOld(name, program)} ·{" "}
          <ExternalLink href={setup}>{words.howToUpdate}</ExternalLink>
        </>
      );
    case "signed-out":
      return words.stripSignedOut(name, program);
  }
}

/** What to say after Sign in for this agent: the command to run by hand, or why it couldn't ask. */
function SignInLines({ outcome }: { readonly outcome: SignInOutcome | null }) {
  if (outcome === null) return null;
  if (outcome.kind === "failed")
    return <p className="mt-2">{words.couldntOpenSignIn(outcome.reason)}</p>;
  return (
    <div className="mt-2 flex flex-col gap-1">
      <p>{words.couldntOpenTerminal}</p>
      <CommandBox command={outcome.command} />
    </div>
  );
}

/**
 * The one strip above the harness choice when the chosen program can't run (harness-states rule
 * 1), or nothing. A signed-out agent gets **Sign in for this agent**, which opens the program's own
 * sign-in for this agent in a terminal (HAL-5395); the person signs in there, then chooses **Check
 * again**. Render it with a `key` of the agent and harness, so a new one starts with nothing said.
 */
export function HarnessStripCallout({
  host,
  agent,
  name,
  harness,
  found,
  check,
}: HarnessStripCalloutProps) {
  const [outcome, setOutcome] = useState<SignInOutcome | null>(null);
  const strip = harnessStrip(harness, found);
  if (strip === null || harness === "halonic") return null;

  const signIn = async () => {
    setOutcome(null);
    try {
      const answer = await host.openHarnessSignIn(agent, harness);
      setOutcome(answer.opened ? null : { kind: "not-opened", command: answer.command });
    } catch (error) {
      setOutcome({
        kind: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const checkAgain: CalloutAction = {
    label: words.checkAgain,
    busyLabel: words.checking,
    onClick: check,
  };
  const actions =
    strip === "signed-out"
      ? [{ label: words.signInForAgent, onClick: signIn }, checkAgain]
      : checkAgain;
  return (
    <Callout tone="warning" action={actions}>
      {stripWords(strip, name, harness)}
      {strip === "signed-out" && <SignInLines outcome={outcome} />}
    </Callout>
  );
}
