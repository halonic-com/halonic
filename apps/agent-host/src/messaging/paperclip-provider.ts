import { shippedCatalog } from "@halonicjs/action-catalog";
import {
  LiveEventsConnection,
  type LiveSignal,
  type LiveTaskChanges,
  type PaperclipAnswer,
  PaperclipFeedback,
  type PaperclipKeyGuard,
  PaperclipMessaging,
  type PaperclipMessagingOptions,
  PaperclipTeamStatus,
  type RouteTimingSink,
  touchedBy,
} from "@halonicjs/adapter-paperclip-client";
import type {
  PaperclipBinding,
  PaperclipConnectionNow,
  PaperclipKeys,
} from "@halonicjs/host-agent-messaging-hub";
import type { EventsSignal, OpenEvents } from "@halonicjs/host-paperclip-sync";
import type { MessagingSource } from "@halonicjs/ports";

/** What {@link paperclipProvider} needs for one connection the person connected. */
export interface PaperclipProviderOptions {
  binding: PaperclipBinding;
  keys: PaperclipKeys;
  /** The connection file's label, such as "Halonic". */
  label: string;
  /** Reads the connection file as it is now; `undefined` when it is gone or broken. */
  readNow: () => Promise<PaperclipConnectionNow | undefined>;
  /** Hears a read of whom the key belongs to that threw; the next poll reads again. */
  reportUserRead: (error: unknown) => void;
  /** The `fetch` the provider sends with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
  /** Hears each Paperclip call's route template, status, time and size; never its address or body. */
  timing?: RouteTimingSink;
  /** The tasks the connection's live events named, shared by its events socket and its provider. */
  liveTasks?: LiveTaskChanges;
}

const signedOut: PaperclipAnswer = { kind: "failed", failure: "signed-out" };

/**
 * The Paperclip provider for one connection, or `undefined` when the host
 * holds no key for it (`agent-host.paperclip-key`). It is made for the
 * address and company the key was made for, and every request goes through
 * the key's guard: the connection file is read again, and only when its
 * address and company still match is the request sent, with the key. A file
 * that is gone, or a key replaced for another address meanwhile, sends
 * nothing and reads as signed out.
 */
export function paperclipProvider(
  options: PaperclipProviderOptions,
): PaperclipConnectionProvider | undefined {
  const guarded = guardedKey(options);
  if (guarded === undefined) return undefined;
  return new PaperclipConnectionProvider(options.reportUserRead, {
    ...guarded,
    label: `Paperclip · ${options.label}`,
    // A card pinned to a stepper request this Halonic ships becomes an action item.
    stepperCatalog: shippedCatalog,
    liveTasks: options.liveTasks,
    ...network(options),
  });
}

/**
 * The connection's `TeamStatus` (`agent-host.team-activity-routes`), or
 * `undefined` when the host holds no key for it. It sends through the same
 * key guard as {@link paperclipProvider}, so it too reads only at the address
 * and company the key was made for.
 */
export function paperclipTeamStatus(
  options: PaperclipProviderOptions,
): PaperclipTeamStatus | undefined {
  const guarded = guardedKey(options);
  return guarded === undefined
    ? undefined
    : new PaperclipTeamStatus({ ...guarded, ...network(options) });
}

/** What {@link paperclipFeedback} needs: one connection's key, and its file as it is now. */
export type PaperclipFeedbackSenderOptions = Pick<
  PaperclipProviderOptions,
  "binding" | "keys" | "readNow" | "fetch"
>;

/**
 * The connection's feedback sender (`agent-host.feedback-send-route`), or
 * `undefined` when the host holds no key for it. It sends through the same
 * key guard as {@link paperclipProvider}, so it too sends only to the address
 * and company the key was made for.
 */
export function paperclipFeedback(
  options: PaperclipFeedbackSenderOptions,
): PaperclipFeedback | undefined {
  const guarded = guardedKey(options);
  if (guarded === undefined) return undefined;
  const { address, key, company } = guarded;
  return new PaperclipFeedback({
    address,
    key,
    company,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

/**
 * Opens the connection's live events socket (`agent-host.paperclip-live-events`), or `undefined`
 * when the host holds no key for it. It sends through the same key guard as
 * {@link paperclipProvider}, so only to the address and company the key was made for, and tells
 * the sync only what it needs: that an event touched the local copy, never what the event said.
 * The provider hears, through `liveTasks`, only which task an event named, so its next read reads
 * that task's cards again (`paperclip-client.event-card-reads`).
 * A failure to open that the connection doesn't report as `closed` is reported, and counts as one.
 */
export function paperclipEvents(
  options: Pick<PaperclipProviderOptions, "binding" | "keys" | "readNow" | "liveTasks">,
  report: (error: unknown) => void,
): OpenEvents | undefined {
  const guarded = guardedKey(options);
  if (guarded === undefined) return undefined;
  const { address, key, company } = guarded;
  return (onSignal) => {
    const connection = new LiveEventsConnection({
      address,
      key,
      company,
      onSignal: liveSignalHandler(options.liveTasks, onSignal),
    });
    connection.open().catch((error: unknown) => {
      report(error);
      onSignal({ kind: "closed", refused: false });
    });
    return connection;
  };
}

/**
 * Hears the socket's signals: `liveTasks` notes the task an event names, then the sync hears
 * {@link eventsSignalOf} the signal, so the read it brings already reads that task's cards again.
 */
export function liveSignalHandler(
  liveTasks: LiveTaskChanges | undefined,
  onSignal: (signal: EventsSignal) => void,
): (signal: LiveSignal) => void {
  return (signal) => {
    if (signal.kind === "event") liveTasks?.heard(signal.event);
    const heard = eventsSignalOf(signal);
    if (heard !== undefined) onSignal(heard);
  };
}

/**
 * What the sync hears of a live signal: an event only when it touches the local copy, and a close
 * as refused when Paperclip won't let this key use the socket (403) or no longer accepts it.
 */
export function eventsSignalOf(signal: LiveSignal): EventsSignal | undefined {
  switch (signal.kind) {
    case "event":
      return touchedBy(signal.event).length > 0 ? { kind: "change" } : undefined;
    case "closed":
      return {
        kind: "closed",
        refused: signal.why === "not-allowed" || signal.why === "signed-out",
      };
    default:
      return signal;
  }
}

/** Where the key was made for, and the guard that checks the connection file before each request. */
function guardedKey(options: Pick<PaperclipProviderOptions, "binding" | "keys" | "readNow">) {
  const { binding, keys } = options;
  const madeFor = keys.madeFor(binding);
  if (madeFor === undefined) return undefined;
  const guard: PaperclipKeyGuard = async (request) => {
    const now = await options.readNow();
    if (now === undefined) return signedOut;
    return keys.callWith(binding, now, (use) =>
      use.origin === madeFor.address ? request(use.key) : Promise.resolve(signedOut),
    );
  };
  return {
    address: madeFor.address,
    key: guard,
    connection: binding.connection,
    company: madeFor.company,
  };
}

function network(
  options: PaperclipProviderOptions,
): Pick<PaperclipProviderOptions, "fetch" | "now" | "timing"> {
  return {
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.timing === undefined ? {} : { timing: options.timing }),
  };
}

/**
 * One connection's provider, which knows whom it is signed in as
 * (`agent-host.paperclip-signed-in-user`): two accounts on one Paperclip
 * then read as two sources, "Paperclip · Halonic · Board Supervisor". The
 * poller leaves it alone once it is signed out: only a new key, which Connect
 * hands over and which makes a new provider, can sign it in again, so polling
 * on would only repeat the refusal every 30 seconds.
 */
export class PaperclipConnectionProvider extends PaperclipMessaging {
  readonly #reportUserRead: (error: unknown) => void;
  /** The user's name once read; `null` once read from a Paperclip that holds none. */
  #userName: string | null | undefined;

  constructor(reportUserRead: (error: unknown) => void, options: PaperclipMessagingOptions) {
    super(options);
    this.#reportUserRead = reportUserRead;
  }

  /** The name of the Paperclip user the key belongs to, once read. */
  get userName(): string | undefined {
    return this.#userName ?? undefined;
  }

  /**
   * Reads whom the key belongs to, until one read worked: Connect calls it
   * once, and a poll tries again when Connect's read failed. A read that
   * throws is reported, never thrown, so the poll it is part of goes on
   * (`agent-host.paperclip-user-read-again`).
   */
  async readUser(): Promise<void> {
    if (this.#userName !== undefined) return;
    try {
      const user = await this.signedInUser();
      if (user !== undefined) this.#userName = user.name ?? null;
    } catch (error) {
      this.#reportUserRead(error);
    }
  }

  override async listSources(): Promise<readonly MessagingSource[]> {
    const sources = await super.listSources();
    const { userName } = this;
    if (userName === undefined) return sources;
    return sources.map((source) => ({ ...source, label: withUserName(source.label, userName) }));
  }

  /**
   * Whether the source may be read again: not once it is signed out. Reads whom the key belongs
   * to first, when Connect's read failed.
   */
  async mayRead(): Promise<boolean> {
    const [source] = await super.listSources();
    if (source?.state.kind === "signed-out") return false;
    await this.readUser();
    return true;
  }

  override async refresh(): Promise<void> {
    if (await this.mayRead()) await super.refresh();
  }
}

/** How many characters of the user's name a label shows; a longer name ends in "…". */
const labelNameLength = 40;

/**
 * A connection's label with whom it is signed in as, "Paperclip · Halonic ·
 * Board Supervisor". A long name is cut to {@link labelNameLength}
 * characters and an ellipsis, so it can't push the label off a row
 * (`agent-host.paperclip-user-read-again`); the row's `userName` keeps it whole.
 */
export function withUserName(label: string, userName: string): string {
  const characters = [...userName];
  const shown =
    characters.length > labelNameLength
      ? `${characters
          .slice(0, labelNameLength - 1)
          .join("")
          .trimEnd()}…`
      : userName;
  return `${label} · ${shown}`;
}
