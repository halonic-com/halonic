import { type Infer, parse, s } from "@halonicjs/schema-kit";
import type {
  ComputerId,
  ComputerTunnelSendResult,
  ConnectOutcome,
  ForgetOutcome,
  KeysUnavailable,
  ListedComputer,
  PairingId,
  PairingOutcome,
  PairingStep,
  PhoneStatus,
  TunnelPairingProblem,
} from "@halonicjs/studio-feature-remote/phone";

/**
 * The shell's phone tunnel answers (`halonic-phone-tunnel`'s `answers.rs`, `status.rs` and
 * `messages.rs`), read into the `PhoneTunnel` and `ComputerTunnel` ports' types. Each answer is checked against its schema first, so the
 * page never acts on a shape it doesn't know: such an answer goes to `report` and reads as the
 * call's safest outcome. No answer carries a key, the pairing code or its psk; the schemas are
 * strict, so one that did would not read either.
 */

/** Milliseconds since the Unix epoch, within what a `Date` holds, so `toISOString` can't throw. */
const timeMs = s.number().int().min(0).max(8_640_000_000_000_000);

const reachFailure = s.enum(["network-down", "timeout", "refused", "unreachable"]);

/** Every `Problem` the shell can answer, tagged by `kind`. */
const problemSchema = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("wrong-code"), triesLeft: s.number().int().min(0) }).strict(),
  s.object({ kind: s.literal("cant-reach"), reason: reachFailure }).strict(),
  s.object({ kind: s.literal("no-local-network"), askAgain: s.boolean() }).strict(),
  s
    .object({
      kind: s.enum([
        "code-ended",
        "code-used",
        "rate-limited",
        "denied",
        "timed-out",
        "handshake-failed",
        "unreadable",
        "bad-start",
        "not-paired",
        "key-unreadable",
        "keys-unavailable",
      ]),
    })
    .strict(),
]);

type ShellProblem = Infer<typeof problemSchema>;

const computerSchema = s
  .object({
    id: s.string().min(1),
    standing: s.enum(["paired", "cant-confirm", "removed", "unreadable"]),
    name: s.string().optional(),
    endpoints: s.array(s.string()),
    pairedAtMs: timeMs.optional(),
    lastConnectedAtMs: timeMs.optional(),
  })
  .strict();

type ShellComputer = Infer<typeof computerSchema>;

const stepSchema = s.union([
  s.object({ kind: s.literal("check"), computerName: s.string(), checkCode: s.string() }).strict(),
  problemSchema,
]);
const outcomeSchema = s.union([
  s.object({ kind: s.literal("paired"), computer: computerSchema }).strict(),
  problemSchema,
]);
const computersSchema = s.union([
  s.object({ kind: s.literal("computers"), computers: s.array(computerSchema) }).strict(),
  problemSchema,
]);
const connectSchema = s.union([
  s.object({ kind: s.literal("connecting") }).strict(),
  problemSchema,
]);
const forgetSchema = s.union([s.object({ kind: s.literal("forgotten") }).strict(), problemSchema]);

const statusSchema = s.discriminatedUnion("state", [
  s
    .object({
      state: s.literal("reconnecting"),
      lastTry: reachFailure.optional(),
      nextTryAtMs: timeMs.optional(),
    })
    .strict(),
  s
    .object({
      state: s.enum(["connecting", "connected", "cant-confirm", "removed", "paused", "closed"]),
    })
    .strict(),
]);

/** A session's number: the shell counts them from 1 and never gives one out twice. */
const generationSchema = s.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** One event on the `phone_tunnel_watch` channel (the shell's `TunnelEvent`). */
const eventSchema = s.discriminatedUnion("kind", [
  s
    .object({ kind: s.literal("status"), computer: s.string().min(1), status: statusSchema })
    .strict(),
  s
    .object({
      kind: s.literal("session-opened"),
      computer: s.string().min(1),
      generation: generationSchema,
    })
    .strict(),
  s
    .object({
      kind: s.literal("message"),
      computer: s.string().min(1),
      generation: generationSchema,
      text: s.string(),
    })
    .strict(),
]);

/** The answer to `tunnel_send` (`SendAnswer`). */
const sendSchema = s.union([
  s.object({ sent: s.literal(true) }).strict(),
  s
    .object({
      sent: s.literal(false),
      reason: s.enum(["not-open", "too-large", "not-allowed", "not-confirmed"]),
    })
    .strict(),
]);

/**
 * One event from the shell, read: a computer's status, a session that opened on it, or one of
 * that session's host messages, as text the gateway client parses itself.
 */
export type TunnelEvent =
  | { readonly kind: "status"; readonly computer: ComputerId; readonly status: PhoneStatus }
  | { readonly kind: "session-opened"; readonly computer: ComputerId; readonly generation: number }
  | {
      readonly kind: "message";
      readonly computer: ComputerId;
      readonly generation: number;
      readonly text: string;
    };

/** Where an answer the page doesn't know goes, with the command that gave it. */
export type Report = (line: string) => void;

const keysUnavailable: KeysUnavailable = { kind: "keys-unavailable" };
/** A send the shell didn't make, for any reason the page can't tell apart. */
export const notOpen: ComputerTunnelSendResult = { sent: false, reason: "not-open" };
/** A pairing answer the page can't use: the screens show the generic problem screen. */
const badStart = { kind: "bad-start" } as const;

/** The answer to `phone_pair_start`, with the id the adapter gave this pairing. */
export function readPairingStep(answer: unknown, pairing: PairingId, report: Report): PairingStep {
  const parsed = parse(stepSchema, answer);
  if (!parsed.ok) return unknownAnswer("phone_pair_start", report, badStart);
  const step = parsed.value;
  switch (step.kind) {
    case "check":
      return { kind: "check", pairing, checkCode: step.checkCode, computerName: step.computerName };
    case "no-local-network":
      return step;
    case "key-unreadable":
    case "keys-unavailable":
      return { kind: step.kind };
    // Only the page's own start can name a computer that isn't listed (HAL-15712).
    case "not-paired":
      return badStart;
    default:
      return pairingProblem(step, "phone_pair_start", report);
  }
}

/** The answer to `phone_pair_wait`. */
export function readPairingOutcome(answer: unknown, report: Report): PairingOutcome {
  const parsed = parse(outcomeSchema, answer);
  if (!parsed.ok) return unknownAnswer("phone_pair_wait", report, badStart);
  const outcome = parsed.value;
  switch (outcome.kind) {
    case "paired": {
      const computer = listedComputer(outcome.computer);
      return computer.standing === "unreadable"
        ? unknownAnswer("phone_pair_wait", report, { kind: "unreadable" })
        : { kind: "paired", computer };
    }
    case "denied":
      return { kind: "refused" };
    case "timed-out":
      return { kind: "timeout" };
    case "keys-unavailable":
      return keysUnavailable;
    default:
      return pairingProblem(outcome, "phone_pair_wait", report);
  }
}

/** The answer to `phone_computers`: the list, or broken key storage. */
export function readComputers(
  answer: unknown,
  report: Report,
): readonly ListedComputer[] | KeysUnavailable {
  const parsed = parse(computersSchema, answer);
  if (!parsed.ok) return unknownAnswer("phone_computers", report, keysUnavailable);
  const listed = parsed.value;
  if (listed.kind === "computers") return listed.computers.map(listedComputer);
  // Listing reads only the key store, so every other problem is a broken one too.
  if (listed.kind !== "keys-unavailable") report(`phone_computers answered ${listed.kind}`);
  return keysUnavailable;
}

/** The answer to `phone_forget`. */
export function readForget(answer: unknown, report: Report): ForgetOutcome {
  const parsed = parse(forgetSchema, answer);
  if (!parsed.ok) return unknownAnswer("phone_forget", report, keysUnavailable);
  switch (parsed.value.kind) {
    // Not listed any more, as Forget asked.
    case "forgotten":
    case "not-paired":
      return { kind: "forgotten" };
    case "keys-unavailable":
      return keysUnavailable;
    default:
      report(`phone_forget answered ${parsed.value.kind}`);
      return keysUnavailable;
  }
}

/** The answer to `phone_connect`; the status follows on the channel. */
export function readConnect(answer: unknown, report: Report): ConnectOutcome {
  const unreachable = { kind: "cant-reach", reason: "unreachable" } as const;
  const parsed = parse(connectSchema, answer);
  if (!parsed.ok) return unknownAnswer("phone_connect", report, unreachable);
  const outcome = parsed.value;
  switch (outcome.kind) {
    case "cant-reach":
    case "no-local-network":
      return outcome;
    case "connecting":
    case "not-paired":
    case "key-unreadable":
    case "keys-unavailable":
      return { kind: outcome.kind };
    default:
      report(`phone_connect answered ${outcome.kind}`);
      return unreachable;
  }
}

/** An event from the watch channel, or `undefined` for an event the page doesn't know. */
export function readTunnelEvent(event: unknown, report: Report): TunnelEvent | undefined {
  const parsed = parse(eventSchema, event);
  if (!parsed.ok) {
    // Only the event's kind is safe to name: a message's text stays out of the log.
    report("phone_tunnel_watch sent an event the page doesn't know");
    return undefined;
  }
  const read = parsed.value;
  const computer = read.computer as ComputerId;
  switch (read.kind) {
    case "status":
      return { kind: "status", computer, status: pageStatus(read.status) };
    case "session-opened":
      return { kind: "session-opened", computer, generation: read.generation };
    case "message":
      return { kind: "message", computer, generation: read.generation, text: read.text };
  }
}

/**
 * The answer to `tunnel_send`. One the page doesn't know reads as `not-open`: the client then
 * says the message wasn't sent, which is true as far as the page can tell.
 */
export function readSendAnswer(answer: unknown, report: Report): ComputerTunnelSendResult {
  const parsed = parse(sendSchema, answer);
  if (!parsed.ok) return unknownAnswer("tunnel_send", report, notOpen);
  return parsed.value;
}

/** `nextTryAtMs` becomes the port's ISO `nextTryAt`; the screen counts down from it. */
function pageStatus(status: Infer<typeof statusSchema>): PhoneStatus {
  if (status.state !== "reconnecting") return { state: status.state };
  return {
    state: "reconnecting",
    ...(status.lastTry === undefined ? {} : { lastTry: status.lastTry }),
    ...(status.nextTryAtMs === undefined ? {} : { nextTryAt: isoTime(status.nextTryAtMs) }),
  };
}

/** A computer whose details are missing reads as unreadable: it can still be forgotten. */
function listedComputer(computer: ShellComputer): ListedComputer {
  const id = computer.id as ComputerId;
  const { name, pairedAtMs } = computer;
  if (computer.standing === "unreadable" || name === undefined || pairedAtMs === undefined) {
    return { id, standing: "unreadable" };
  }
  return {
    id,
    name,
    pairedAt: isoTime(pairedAtMs),
    ...(computer.lastConnectedAtMs === undefined
      ? {}
      : { lastConnectedAt: isoTime(computer.lastConnectedAtMs) }),
    endpoints: computer.endpoints,
    standing: computer.standing,
  };
}

/** The problems a pairing shows as they are; any other reads as a bug on the generic screen. */
function pairingProblem(
  problem: ShellProblem,
  command: string,
  report: Report,
): TunnelPairingProblem {
  switch (problem.kind) {
    case "wrong-code":
    case "cant-reach":
      return problem;
    case "code-ended":
    case "code-used":
    case "rate-limited":
    case "handshake-failed":
    case "unreadable":
    case "bad-start":
      return { kind: problem.kind };
    default:
      report(`${command} answered ${problem.kind}`);
      return badStart;
  }
}

function unknownAnswer<T>(command: string, report: Report, fallback: T): T {
  report(`${command} gave an answer the page doesn't know`);
  return fallback;
}

function isoTime(ms: number): string {
  return new Date(ms).toISOString();
}
