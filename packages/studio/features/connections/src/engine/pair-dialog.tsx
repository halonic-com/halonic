import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import type { ServerEngine } from "@halonicjs/studio-services";
import { useEffect, useRef, useState } from "react";
import { isAllowedAddress } from "../connect/connect-dialog.tsx";
import { EndingStep, plainText, useLeftMs, withCode } from "../connect/connect-steps.tsx";
import * as connectWords from "../connections-words.ts";
import * as words from "../server-engine-words.ts";
import { AccessFields } from "./access-fields.tsx";
import {
  type EnterProblem,
  type PairEnding,
  type Pairing,
  readServerCode,
  usePairing,
} from "./pair-flow.ts";
import { WaitStep } from "./wait-step.tsx";

/** The props of {@link PairDialog}. */
export interface PairDialogProps {
  readonly engine: ServerEngine;
  /** Pair again: the address of the pairing that ended, filled in. */
  readonly again?: { readonly address: string } | undefined;
  /** This computer's name, filled in and editable. */
  readonly computerName: string;
  /** Runs once the dialog has cancelled its pairing; the opener unmounts it. */
  readonly onClose: () => void;
  /** Runs once the server allowed this computer and the keychain holds the pairing. */
  readonly onPaired: (paired: { readonly address: string; readonly sessionEndsAt: string }) => void;
  /** Runs after `onClose` when the server wasn't told to drop the pairing. */
  readonly onCancelFailed: () => void;
  /** Where the countdown counts from. Default the clock. */
  readonly now?: () => number;
}

/** The name a pairing sends: the one typed, or the fallback when the field is empty. */
function deviceNameOf(typed: string): string {
  return typed.trim() || words.NAME_FALLBACK;
}

/** An ending's heading and text, with this computer's name where it names it. */
function endingOf(ending: PairEnding, name: string): connectWords.Ending {
  switch (ending) {
    case "expired":
      return words.PAIR_EXPIRED;
    case "refused":
      return words.PAIR_REFUSED;
    case "taken-over":
      return words.PAIR_TAKEN_OVER;
    case "not-saved":
      return words.PAIR_NOT_SAVED;
    case "not-saved-still-on":
      return words.pairNotSavedStillOn(name);
    case "lost":
      return words.pairLost(name);
  }
}

/**
 * Pair with a server, or Pair again (`connections.server-pair-dialog`): the server's address, its
 * pairing code and this computer's name (P1), then the check code to compare and the time left
 * while the owner allows it (P2), and why it ended when it didn't pair (E1–E5). The page never
 * sees the device token: the host keeps it, and answers only where the pairing stands.
 */
export function PairDialog(props: PairDialogProps) {
  const { engine, again, onClose, onPaired } = props;
  const pairing = usePairing(engine, props.now);
  const title = again === undefined ? words.PAIR_TITLE : words.PAIR_AGAIN;
  // Kept here, so Start again shows the address and the name the last pairing used.
  const [address, setAddress] = useState(again?.address ?? "");
  const [name, setName] = useState(props.computerName);
  const [access, setAccess] = useState({ clientId: "", clientSecret: "" });
  const view = pairing.view;
  const leftMs = useLeftMs(view.stage === "waiting" ? view : undefined, props.now);

  const timedOut = view.stage === "waiting" && leftMs <= 0;
  const { expire } = pairing;
  useEffect(() => {
    if (timedOut) expire();
  }, [timedOut, expire]);

  const sessionEndsAt = view.stage === "paired" ? view.sessionEndsAt : undefined;
  useEffect(() => {
    if (sessionEndsAt !== undefined) onPaired({ address: address.trim(), sessionEndsAt });
  }, [sessionEndsAt, onPaired, address]);

  const close = () => {
    pairing.cancel().then(
      (told) => {
        onClose();
        if (!told) props.onCancelFailed();
      },
      () => {
        onClose();
        props.onCancelFailed();
      },
    );
  };

  if (view.stage === "enter" || view.stage === "starting") {
    return (
      <EnterStep
        title={title}
        again={again !== undefined}
        pairing={pairing}
        address={address}
        onAddressChange={setAddress}
        name={name}
        onNameChange={setName}
        access={access}
        onAccessChange={setAccess}
        problem={view.stage === "enter" ? view.problem : undefined}
        busy={view.stage === "starting"}
        onClose={close}
        now={props.now ?? Date.now}
      />
    );
  }
  if (view.stage === "ended" || timedOut) {
    const ending = view.stage === "ended" ? view.ending : "expired";
    return (
      <EndingStep
        title={title}
        ending={endingOf(ending, deviceNameOf(name))}
        onClose={close}
        onStartAgain={pairing.again}
      />
    );
  }
  if (view.stage === "waiting") {
    return (
      <WaitStep
        title={title}
        view={view}
        name={deviceNameOf(name)}
        leftMs={leftMs}
        onCancel={close}
      />
    );
  }
  return null;
}

/** The error under each field, for the problem P1 shows. */
function fieldErrors(problem: EnterProblem | undefined) {
  if (problem === undefined || problem.field === "dialog") return {};
  if (problem.field === "address") {
    const byKind = {
      https: connectWords.ADDRESS_HTTPS_ONLY,
      unreachable: words.SERVER_UNREACHABLE,
      "not-halonic": words.NOT_HALONIC,
    } as const;
    return { address: plainText(byKind[problem.kind]) };
  }
  if (problem.kind === "too-many") return { code: words.tooManyCodes(problem.minutes) };
  return { code: plainText(problem.kind === "format" ? words.CODE_FORMAT : words.CODE_REFUSED) };
}

/** Whether Continue is off for too many wrong codes, read again once a second until it isn't. */
function useLockedOut(problem: EnterProblem | undefined, now: () => number): boolean {
  const until = problem?.kind === "too-many" ? problem.until : undefined;
  const [, setTick] = useState(0);
  const locked = until !== undefined && now() < until;
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(timer);
  }, [locked]);
  return locked;
}

/** P1: the address, the code and the name, with Continue. */
function EnterStep(props: {
  readonly title: string;
  readonly again: boolean;
  readonly pairing: Pairing;
  readonly address: string;
  readonly onAddressChange: (address: string) => void;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly access: { readonly clientId: string; readonly clientSecret: string };
  readonly onAccessChange: (access: { clientId: string; clientSecret: string }) => void;
  readonly problem: EnterProblem | undefined;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly now: () => number;
}) {
  const { busy, problem } = props;
  const [code, setCode] = useState("");
  const [checked, setChecked] = useState<EnterProblem | undefined>();
  const [bothNeeded, setBothNeeded] = useState(false);
  const addressInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const shown = checked ?? problem;
  const errors = fieldErrors(shown);
  const locked = useLockedOut(problem, props.now);
  // The kit's Button wants the id of the line that says why Continue is off: the code's error.
  const [lockReason, setLockReason] = useState<string>();
  useEffect(() => {
    setLockReason(locked ? (codeInput.current?.getAttribute("aria-describedby") ?? "") : undefined);
  }, [locked]);

  // The kit's Dialog contract: an error on a field takes focus to that field.
  useEffect(() => {
    if (problem?.field === "address") addressInput.current?.focus();
    if (problem?.field === "code") codeInput.current?.focus();
  }, [problem]);

  const start = () => {
    const address = props.address.trim();
    const plain = readServerCode(code);
    if (!isAllowedAddress(address)) {
      setChecked({ field: "address", kind: "https" });
      addressInput.current?.focus();
      return;
    }
    if (plain === undefined) {
      setChecked({ field: "code", kind: "format" });
      codeInput.current?.focus();
      return;
    }
    const clientId = props.access.clientId.trim();
    const clientSecret = props.access.clientSecret.trim();
    const filled = clientId !== "" || clientSecret !== "";
    setBothNeeded(filled && (clientId === "" || clientSecret === ""));
    if (filled && (clientId === "" || clientSecret === "")) return;
    setChecked(undefined);
    props.pairing.start(
      address,
      plain,
      deviceNameOf(props.name),
      filled ? { clientId, clientSecret } : undefined,
    );
  };

  return (
    <Dialog
      size="md"
      title={props.title}
      closeLabel={`Close ${props.title}`}
      form
      confirm={{
        label: connectWords.CONTINUE,
        busyLabel: words.STARTING_PAIRING,
        ...(lockReason === undefined ? {} : { unavailable: { reason: lockReason } }),
      }}
      busy={busy}
      onConfirm={start}
      onCancel={props.onClose}
      initialFocus={() => (props.again ? codeInput.current : addressInput.current)}
      {...(shown?.field === "dialog"
        ? {
            error: shown.kind === "access-refused" ? words.ACCESS_REFUSED : words.PAIR_START_FAILED,
          }
        : {})}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-fg">{withCode(words.PAIR_LEAD)}</p>
        <Field
          label={words.SERVER_ADDRESS_LABEL}
          hint={withCode(words.SERVER_ADDRESS_HINT)}
          error={errors.address ?? null}
        >
          <Input
            ref={addressInput}
            mono
            readOnly={busy}
            value={props.address}
            placeholder={words.SERVER_ADDRESS_PLACEHOLDER}
            onChange={(event) => props.onAddressChange(event.target.value)}
          />
        </Field>
        <Field label={words.CODE_LABEL} hint={words.CODE_HINT} error={errors.code ?? null}>
          <Input
            ref={codeInput}
            mono
            readOnly={busy}
            value={code}
            placeholder={words.CODE_PLACEHOLDER}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Field label={words.NAME_LABEL} hint={words.NAME_HINT}>
          <Input
            readOnly={busy}
            value={props.name}
            maxLength={80}
            onChange={(event) => props.onNameChange(event.target.value)}
          />
        </Field>
        <AccessFields
          value={props.access}
          onChange={props.onAccessChange}
          readOnly={busy}
          error={bothNeeded ? words.ACCESS_BOTH : null}
        />
      </div>
    </Dialog>
  );
}
