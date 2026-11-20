import type { PairedPhone } from "@halonicjs/ports";
import { Button, Callout, CodeDisplay, CopyButton, QrTile } from "@halonicjs/studio-kit";
import { useEffect, useId, useRef, useState } from "react";
import type { CheckEvent, CodeEvent } from "./pairing-flow.ts";
import * as words from "./pairing-words.ts";

/** Focus that fell to the page, because the step that held it went away. */
const focusLost = (): boolean =>
  document.activeElement === null || document.activeElement === document.body;

/** Re-renders once a second while mounted, for a timer written as text. */
function useSecondTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, []);
}

/** The code to scan, or to type instead, with the three steps and the safety line. */
export function CodeStep({
  code,
  provider,
  now,
  onNewCode,
}: {
  readonly code: CodeEvent;
  readonly provider: string;
  readonly now: () => number;
  readonly onNewCode: () => void;
}) {
  useSecondTick();
  const [typing, setTyping] = useState(false);
  const typedId = useId();
  const newCodeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusLost()) newCodeButton.current?.focus();
  }, []);
  const left = Date.parse(code.expiresAt) - now();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6">
        <QrTile value={code.qr} label={words.QR_LABEL} />
        <ol className="m-0 flex flex-1 list-decimal flex-col gap-4 pl-5 text-fg">
          <li>{words.STEP_OPEN}</li>
          <li>{words.STEP_SCAN}</li>
          <li>{words.STEP_CHECK}</li>
        </ol>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-fg-muted">{words.endsIn(left)}</p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={typing}
            aria-controls={typedId}
            onClick={() => setTyping(!typing)}
          >
            {words.TYPE_INSTEAD}
          </Button>
          <Button variant="ghost" size="sm" ref={newCodeButton} onClick={onNewCode}>
            {words.NEW_CODE}
          </Button>
        </div>
      </div>
      <div id={typedId} hidden={!typing} className="flex flex-col gap-2">
        <p className="text-fg">{words.typeLine(code.hostName)}</p>
        <div className="flex flex-wrap items-center gap-3">
          <CodeDisplay code={code.code} group={4} size="md" label={words.PAIRING_CODE} />
          <CopyButton text={code.code} label={words.COPY_CODE} />
        </div>
      </div>
      <Callout tone="info">{words.SAFETY}</Callout>
      <p className="text-small text-fg-muted">{words.reachedThrough(provider)}</p>
    </div>
  );
}

/** The phone that used the code and its check code, which takes focus: Allow is never the default. */
export function CheckStep({
  check,
  provider,
}: {
  readonly check: CheckEvent;
  readonly provider: string;
}) {
  const codeBox = useRef<HTMLDivElement>(null);
  useEffect(() => codeBox.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-fg">{words.CHECK_QUESTION}</p>
      <div className="flex flex-col gap-0.5">
        <p className="text-body-strong text-fg">{check.phoneName}</p>
        <p className="text-small text-fg-muted">{words.checkPhoneLine(check.platform, provider)}</p>
      </div>
      {/* Focus starts here (decision 11), so a screen reader reads the code before anything else. */}
      <div ref={codeBox} tabIndex={-1} className="rounded-md focus-ring">
        <CodeDisplay code={check.checkCode} group={3} label={words.CHECK_CODE} />
      </div>
      <p>{words.CHECK_WARNING}</p>
    </div>
  );
}

/** What the new phone can do and where to cut it off. Done takes focus. */
export function PairedStep({
  phone,
  allowRisky,
  onDone,
}: {
  readonly phone: PairedPhone;
  readonly allowRisky: boolean;
  readonly onDone: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus(), []);
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-title text-fg">{words.pairedTitle(phone.name)}</h3>
      <p className="text-fg">{allowRisky ? words.PAIRED_CAN_RISKY : words.PAIRED_CAN}</p>
      <p className="text-fg-muted">{words.PAIRED_REVOKE}</p>
      <div className="flex justify-end">
        <Button ref={done} onClick={onDone}>
          {words.DONE}
        </Button>
      </div>
    </div>
  );
}
