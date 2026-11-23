/**
 * Check this connection's lines and its report (first-run-progress section 6 on HAL-7986): only
 * what the phone can see, its own connection and whether the computer answers, with the marks and
 * the report rules of Check this computer (4.2, 4.3). The phone runs none of the computer's own
 * checks, so the report says they weren't checked instead of passing them.
 */
import type { PhoneStatus, ReachFailure } from "./phone-tunnel.ts";
import { checkWords } from "./reach-words.ts";

/** How the phone reaches the computer, from its first endpoint. */
export type ReachRoute = "tailscale" | "wifi";

/** A line's state: ✓ works, ✕ problem, – info. Never only a colour. */
export type ConnectionMark = "pass" | "problem" | "info";

/** What the check reads: the tunnel's status and whether the first reach gave up. */
export interface ConnectionFacts {
  readonly status: PhoneStatus | undefined;
  /** No answer in the first reach's 30 seconds (or a try that failed during it). */
  readonly gaveUp: boolean;
  readonly route: ReachRoute;
  /** The computer's own name, for the screen only: the report never holds it. */
  readonly computer: string;
}

/** One line of the sheet, with its report row built from fixed words only. */
export interface ConnectionLine {
  readonly id: "phone" | "computer";
  readonly label: string;
  readonly mark: ConnectionMark;
  readonly sentence: string;
  /** What to do, under the sentence, for a problem. */
  readonly fix?: string;
  /** The report's facts: the first beside the label, a fix under it. */
  readonly report: readonly string[];
}

/** The glyph each mark has on screen and in the report, as in Check this computer. */
export const connectionGlyphs: Readonly<Record<ConnectionMark, string>> = {
  pass: "✓",
  problem: "✕",
  info: "–",
};

/** The report's words for a failed try: the tunnel's kinds only, so no error text gets in. */
const failureWords: Readonly<Record<Exclude<ReachFailure, "network-down">, string>> = {
  timeout: "timed out",
  refused: "refused",
  unreachable: "no route to it",
};

const reportRoute: Readonly<Record<ReachRoute, string>> = {
  tailscale: "through Tailscale",
  wifi: "through this Wi-Fi",
};

const reportFix: Readonly<Record<ReachRoute, string>> = {
  tailscale: "Fix: check that it is on and awake, Halonic is open, and Tailscale is on there.",
  wifi: "Fix: check that it is on and awake, Halonic is open, and both are on the same Wi-Fi.",
};

/** The failure of the last try, when the tunnel says one; `network-down` is the phone's own. */
function lastTry(status: PhoneStatus | undefined): ReachFailure | undefined {
  return status?.state === "reconnecting" ? status.lastTry : undefined;
}

function phoneLine({ status, route }: ConnectionFacts): ConnectionLine {
  const { phone } = checkWords;
  const failure = lastTry(status);
  if (failure === "network-down") {
    return {
      id: "phone",
      label: phone.label,
      mark: "problem",
      sentence: phone.offline,
      fix: phone.offlineFix,
      report: ["offline", "Fix: turn on Wi-Fi or mobile data."],
    };
  }
  if (status?.state === "connected" || failure !== undefined) {
    return {
      id: "phone",
      label: phone.label,
      mark: "pass",
      sentence: phone.online[route],
      report: [`online · ${reportRoute[route]}`],
    };
  }
  return {
    id: "phone",
    label: phone.label,
    mark: "info",
    sentence: phone.notKnown,
    report: ["not known yet"],
  };
}

function computerLine({ status, gaveUp, route, computer }: ConnectionFacts): ConnectionLine {
  const words = checkWords.computer;
  const failure = lastTry(status);
  const line = { id: "computer", label: words.label } as const;
  if (status?.state === "connected") {
    return { ...line, mark: "pass", sentence: words.answers(computer), report: ["answers"] };
  }
  // One cause counts once: an offline phone is the Phone line's problem, not this one's.
  if (failure === "network-down") {
    return {
      ...line,
      mark: "info",
      sentence: words.untilOnline,
      report: ["not checked until Phone works"],
    };
  }
  if (failure !== undefined || gaveUp) {
    const why = failure === undefined ? "no answer in 30 seconds" : failureWords[failure];
    return {
      ...line,
      mark: "problem",
      sentence: words.notAnswering(computer),
      fix: words.fix[route](computer),
      report: [`isn't answering · ${why}`, reportFix[route]],
    };
  }
  return { ...line, mark: "info", sentence: words.noAnswerYet, report: ["no answer yet"] };
}

/** The sheet's lines: the phone's own connection, then whether the computer answers. */
export function connectionLines(facts: ConnectionFacts): readonly ConnectionLine[] {
  return [phoneLine(facts), computerLine(facts)];
}

/** True while no try has finished: the sheet says it's checking and offers no report yet. */
export function connectionChecking(facts: ConnectionFacts): boolean {
  return (
    facts.status?.state !== "connected" && lastTry(facts.status) === undefined && !facts.gaveUp
  );
}

/** "1 problem", "2 problems" or "No problems found", counting crosses, which are causes. */
export function connectionHeading(lines: readonly ConnectionLine[]): string {
  const problems = lines.filter((line) => line.mark === "problem").length;
  if (problems === 0) return checkWords.noProblems;
  return `${problems} problem${problems === 1 ? "" : "s"}`;
}

/** The labels are padded to this width, so the facts line up, as in Check this computer. */
const labelWidth = 16;

/** The time as "2026-11-22 10:42", the same in every language. */
function reportTime(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}

function rows(glyph: string, label: string, facts: readonly string[]): string[] {
  const [first = "", ...rest] = facts;
  return [
    `${glyph} ${label.padEnd(labelWidth)}${first}`,
    ...rest.map((fact) => `${" ".repeat(2 + labelWidth)}${fact}`),
  ];
}

/**
 * The plain text Copy report puts on the clipboard and Show the report shows. It is an
 * allow-list: each row is built from fixed words and the tunnel's kinds, so the computer's name,
 * its address and any error text never get in. The last row says what the phone didn't check.
 *
 * @example
 * connectionReport(lines, at);
 * // "Check this connection\n2026-11-22 10:42\n1 problem\n\n✓ Phone           online · through Tailscale\n…"
 */
export function connectionReport(lines: readonly ConnectionLine[], at: Date): string {
  return [
    checkWords.title,
    reportTime(at),
    connectionHeading(lines),
    "",
    ...lines.flatMap((line) => rows(connectionGlyphs[line.mark], line.label, line.report)),
    ...rows(connectionGlyphs.info, "Not checked", [
      "engine, models, sandbox · needs your computer first",
    ]),
  ].join("\n");
}
