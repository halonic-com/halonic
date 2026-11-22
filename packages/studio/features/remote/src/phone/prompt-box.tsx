import { gatewayMaxPromptLength } from "@halonicjs/ports";
import { Button, TextArea } from "@halonicjs/studio-kit";
import { useId, useRef, useState } from "react";
import type { RemoteSendOutcome, RemoteView } from "./remote-view.ts";
import { promptWords, sendOutcomeLine } from "./send-words.ts";

/** The agent a prompt goes to: the session in view. */
export interface PromptTarget {
  readonly sessionId: string;
  readonly title: string;
}

/**
 * The prompt box docked under the agents (`s-m3`). While the view is stale it is off, with
 * "Reconnect to send a prompt." in it, whether or not an agent is in view. While the view is live
 * it shows only for the agent in view (the Agents list alone, `s-m2`, has none), and sends a
 * prompt that isn't blank and fits the protocol's 10,000 characters, once. The text stays after
 * anything but a prompt the host took, and the line under the box says why. Key it by the agent,
 * so one agent's text and line never show under another.
 */
export function PromptBox({
  view,
  agent,
  onSend,
}: {
  readonly view: RemoteView;
  readonly agent: PromptTarget | undefined;
  /** `PhoneRemote.prompt`. */
  readonly onSend: (sessionId: string, text: string) => Promise<RemoteSendOutcome>;
}) {
  const lineId = useId();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | undefined>(undefined);
  // The last "Prompt sent." said, so a second one in a row changes the region's text and is said.
  const lastSent = useRef("");

  if (!view.canAnswer) {
    return (
      <div className="border-t border-border px-3 py-2">
        <TextArea aria-label={promptWords.label} placeholder={promptWords.staleReason} disabled />
      </div>
    );
  }
  if (agent === undefined) return null;

  const tooLong = text.length > gatewayMaxPromptLength;
  const shown = tooLong ? promptWords.tooLong : line;
  const canSend = !sending && !tooLong && text.trim() !== "";

  async function send(target: PromptTarget) {
    if (!canSend) return;
    setSending(true);
    setLine(undefined);
    let outcome: RemoteSendOutcome;
    try {
      outcome = await onSend(target.sessionId, text);
    } finally {
      // A port that throws leaves Send usable again; the rejection still reaches the caller.
      setSending(false);
    }
    if (outcome.kind === "done") {
      setText("");
      lastSent.current =
        lastSent.current === promptWords.sent ? `${promptWords.sent}\u00a0` : promptWords.sent;
      setLine(lastSent.current);
    } else {
      setLine(sendOutcomeLine("prompt", outcome));
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextArea
            aria-label={promptWords.label}
            placeholder={promptWords.placeholder(agent.title)}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button
          variant="primary"
          size="touch"
          busy={sending}
          unavailable={tooLong ? { reason: lineId } : undefined}
          onClick={() => void send(agent)}
        >
          {promptWords.send}
        </Button>
      </div>
      <p id={lineId} role="status" className="text-small text-fg-muted">
        {shown}
      </p>
    </div>
  );
}
