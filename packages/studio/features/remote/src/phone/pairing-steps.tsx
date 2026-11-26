import {
  Button,
  Callout,
  type CalloutHandle,
  CloseIcon,
  CodeDisplay,
  IconTile,
  ShieldIcon,
  TickIcon,
} from "@halonicjs/studio-kit";
import { type ReactNode, type Ref, useEffect, useRef } from "react";
import { MarkedText } from "./marked-text.tsx";
import { pairWords } from "./pair-words.ts";
import type { PairedComputer } from "./phone-tunnel.ts";

/**
 * A pairing screen's body at the top over its bottom buttons, which sit at the foot of the phone
 * in thumb reach: 16px from the sides, and the kit's pb-safe at the bottom (12px or the home bar,
 * whichever is larger).
 */
function StepLayout({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col gap-6 px-6 pt-6">{children}</div>
      <div className="flex flex-col gap-2 px-4 pb-safe">{actions}</div>
    </div>
  );
}

/** `p-m1`: what to do on the computer, what the phone may do, and the two routes. */
export function StartStep({
  scanner,
  scanRef,
  onScan,
  onTypeInstead,
  note,
}: {
  /** False on a build without a scanner: only the typed route is offered. */
  readonly scanner: boolean;
  /** Scan code, which takes focus when the scanner closes. */
  readonly scanRef: Ref<HTMLButtonElement>;
  readonly onScan: () => void;
  readonly onTypeInstead: () => void;
  /** One more line under the intro, such as which screen opens after pairing. */
  readonly note?: string | undefined;
}) {
  return (
    <StepLayout
      actions={
        scanner ? (
          <>
            <Button ref={scanRef} variant="primary" size="touch" block onClick={onScan}>
              {pairWords.scan}
            </Button>
            <Button variant="ghost" size="touch" block onClick={onTypeInstead}>
              {pairWords.typeInstead}
            </Button>
          </>
        ) : (
          <Button variant="primary" size="touch" block onClick={onTypeInstead}>
            {pairWords.typeInstead}
          </Button>
        )
      }
    >
      <p className="text-body text-fg">
        <MarkedText text={pairWords.intro} />
      </p>
      {note === undefined ? null : <p className="text-body text-fg">{note}</p>}
      <div className="flex items-start gap-4 rounded-md border border-border p-4">
        <IconTile>
          <ShieldIcon />
        </IconTile>
        <p className="text-body text-fg">{pairWords.safety}</p>
      </div>
    </StepLayout>
  );
}

/**
 * `p-m2`: the camera runs behind the web view, so this screen is see-through (and the page
 * under it, through `PairingScreens`' `onCamera`); the X, the corner marks and the hint are
 * drawn over the camera. The X is always there, also while Android asks for the camera: on a
 * phone without one the plugin never answers, and the X is the only way out (Priya, HAL-12246).
 * Focus starts on the hint, since Scan code that opened it is gone (C48 PF1).
 */
export function ScannerStep({
  notHalonic,
  onClose,
}: {
  /** "This isn't a Halonic pairing code." in place of the hint (G7). */
  readonly notHalonic: boolean;
  readonly onClose: () => void;
}) {
  // The camera picture is the same in every theme, so the X, the marks and the hint use the kit's
  // always-white scanning colour, not a theme colour that turns dark in a light theme. The X
  // carries it on its icon, since a ghost button sets its own text colour.
  const corner = "absolute size-10 border-qr-light";
  const hint = useRef<HTMLParagraphElement>(null);
  useEffect(() => hint.current?.focus(), []);
  return (
    <div className="relative grid flex-1 place-items-center bg-transparent text-qr-light">
      <div className="absolute start-3 top-3">
        <Button
          variant="ghost"
          size="touch"
          icon={
            <span className="inline-grid place-items-center text-qr-light *:size-full">
              <CloseIcon />
            </span>
          }
          label={pairWords.scanner.close}
          onClick={onClose}
        />
      </div>
      {/* 64px at the top keeps the frame clear of the 48px X on a short screen. */}
      <div className="flex flex-col items-center gap-8 px-6 pt-16 pb-6">
        <div aria-hidden="true" className="relative size-60">
          <span className={`${corner} start-0 top-0 rounded-ss-md border-s-4 border-t-4`} />
          <span className={`${corner} end-0 top-0 rounded-se-md border-e-4 border-t-4`} />
          <span className={`${corner} start-0 bottom-0 rounded-es-md border-s-4 border-b-4`} />
          <span className={`${corner} end-0 bottom-0 rounded-ee-md border-e-4 border-b-4`} />
        </div>
        {/* Polite, so "not a Halonic code" is read once per code that isn't ours (G7). */}
        <p
          ref={hint}
          role="status"
          tabIndex={-1}
          className="max-w-empty rounded-md text-center text-body focus-ring"
        >
          {notHalonic ? pairWords.scanner.notHalonic : pairWords.scanner.hint}
        </p>
      </div>
    </div>
  );
}

/**
 * G8: the camera is off for Halonic. Settings always works, so it shows whatever Android allows.
 * The Callout takes focus when the step shows, so it is read (C48 PF2).
 */
export function NoCameraStep({
  onOpenSettings,
  onTypeInstead,
}: {
  readonly onOpenSettings: () => void;
  readonly onTypeInstead: () => void;
}) {
  const callout = useRef<CalloutHandle>(null);
  useEffect(() => callout.current?.focus(), []);
  return (
    <StepLayout
      actions={
        <>
          <Button variant="primary" size="touch" block onClick={onOpenSettings}>
            {pairWords.camera.openSettings}
          </Button>
          <Button variant="ghost" size="touch" block onClick={onTypeInstead}>
            {pairWords.typeInstead}
          </Button>
        </>
      }
    >
      <Callout tone="attention" title={pairWords.camera.title} announce="focus" ref={callout}>
        {pairWords.camera.body}
      </Callout>
    </StepLayout>
  );
}

/** G9: the phone is waiting for the computer's first answer. */
export function ConnectingStep() {
  return (
    <div className="grid flex-1 place-items-center px-6">
      <p role="status" className="text-body text-fg-muted">
        {pairWords.connecting}
      </p>
    </div>
  );
}

/**
 * `p-m3`: the check code to compare with the computer's, and the wait for Allow there. Focus
 * starts on the code, so a screen reader reads it before anything else, as on the computer.
 */
export function CheckStep({
  checkCode,
  computerName,
  onCancel,
}: {
  readonly checkCode: string;
  readonly computerName: string;
  readonly onCancel: () => void;
}) {
  const codeBox = useRef<HTMLDivElement>(null);
  useEffect(() => codeBox.current?.focus(), []);
  return (
    <StepLayout
      actions={
        <Button size="touch" block onClick={onCancel}>
          {pairWords.check.cancel}
        </Button>
      }
    >
      <p className="text-body text-fg">{pairWords.check.question(computerName)}</p>
      <div ref={codeBox} tabIndex={-1} className="rounded-md focus-ring">
        <CodeDisplay code={checkCode} group={3} label={pairWords.check.title} />
      </div>
      <Callout tone="info">
        <MarkedText text={pairWords.check.hint(computerName)} />
      </Callout>
      <p className="flex items-center gap-3 text-body text-fg-muted">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
        {pairWords.check.waiting(computerName)}
      </p>
    </StepLayout>
  );
}

/** `p-m4`: what this phone can do now and what stays on the computer. Open agents takes focus. */
export function PairedStep({
  computer,
  onOpenAgents,
}: {
  readonly computer: PairedComputer;
  readonly onOpenAgents: () => void;
}) {
  const open = useRef<HTMLButtonElement>(null);
  useEffect(() => open.current?.focus(), []);
  const row = "flex flex-col gap-1 px-6 py-4";
  return (
    <StepLayout
      actions={
        <Button ref={open} variant="primary" size="touch" block onClick={onOpenAgents}>
          {pairWords.done.open}
        </Button>
      }
    >
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        {/* The problem screens' 56px tile, in the halo colours (p-m4). */}
        <span
          aria-hidden="true"
          className="inline-grid size-14 place-items-center rounded-lg bg-halo-tint text-accent-text"
        >
          <span className="inline-grid size-icon-md place-items-center *:size-full">
            <TickIcon />
          </span>
        </span>
        <h2 className="text-heading text-fg">{pairWords.done.heading(computer.name)}</h2>
      </div>
      <dl className="divide-y divide-border rounded-md border border-border">
        <div className={row}>
          <dt className="text-label uppercase text-fg-muted">{pairWords.done.canLabel}</dt>
          <dd className="text-body text-fg">{pairWords.done.can}</dd>
        </div>
        <div className={row}>
          <dt className="text-label uppercase text-fg-muted">{pairWords.done.staysLabel}</dt>
          <dd className="text-body text-fg">{pairWords.done.stays}</dd>
        </div>
      </dl>
    </StepLayout>
  );
}
