import { type Cast, type CastEvent, roundSeconds } from "./asciicast.ts";
import type { Recording } from "./recording.ts";

/** One command as the capture recorded it: the marker, the echoed command line and its output. */
interface CapturedCommand {
  readonly typed: string;
  readonly enterTime: number;
  readonly output: readonly CastEvent[];
}

/**
 * Paces a real capture for reading: the commands are typed at the speed
 * the recording sets, the prompt rests for each `hold`, and a long wait
 * before a command's first output is cut to `maxWaitForOutput`. Output text
 * and the gaps inside a command's output stay as captured.
 */
export function paceCast(capture: Cast, recording: Recording): Cast {
  const { intro, commands } = splitCapture(capture);
  if (commands.length !== recording.commands.length) {
    throw new Error(
      `The capture has ${commands.length} commands, the recording ${recording.commands.length}.`,
    );
  }
  const random = seededRandom(recording.seed);
  const events: CastEvent[] = intro.map((event) => ({ ...event, time: 0 }));
  let clock = recording.startDelay;
  let lastOutputTime = 0;
  commands.forEach((captured, index) => {
    const pacing = recording.commands[index];
    if (pacing === undefined) return;
    events.push({ time: clock, kind: "m", data: captured.typed });
    const characters = Array.from(captured.typed);
    const typingTimes = typingSchedule(characters.length, pacing.typing, random);
    characters.forEach((character, characterIndex) => {
      events.push({ time: clock + (typingTimes[characterIndex] ?? 0), kind: "o", data: character });
    });
    const enterTime = clock + pacing.typing;
    events.push({ time: enterTime, kind: "o", data: "\r\n" });
    lastOutputTime = enterTime;
    const first = captured.output[0];
    if (first !== undefined) {
      const realWait = first.time - captured.enterTime;
      const wait = Math.min(realWait, pacing.maxWaitForOutput ?? realWait);
      for (const event of captured.output) {
        lastOutputTime = enterTime + wait + (event.time - first.time);
        events.push({ ...event, time: lastOutputTime });
      }
    }
    clock = lastOutputTime + pacing.hold;
  });
  const timed = events.map((event) => ({ ...event, time: roundSeconds(event.time) }));
  return {
    header: { ...capture.header, duration: roundSeconds(lastOutputTime + recording.rest) },
    events: timed,
  };
}

/** Splits a capture at its command markers; checks each echoed line is the marked command. */
function splitCapture(capture: Cast): { intro: CastEvent[]; commands: CapturedCommand[] } {
  const intro: CastEvent[] = [];
  const commands: CapturedCommand[] = [];
  let index = 0;
  const events = capture.events.filter((event) => event.kind !== "i");
  while (index < events.length && events[index]?.kind === "o") {
    intro.push(events[index] as CastEvent);
    index += 1;
  }
  while (index < events.length) {
    const marker = events[index] as CastEvent;
    const expectedEcho = `${marker.data}\r\n`;
    let echo = "";
    let enterTime = marker.time;
    index += 1;
    while (
      index < events.length &&
      events[index]?.kind === "o" &&
      echo.length < expectedEcho.length
    ) {
      const event = events[index] as CastEvent;
      echo += event.data;
      enterTime = event.time;
      index += 1;
    }
    if (echo !== expectedEcho)
      throw new Error(`The capture doesn't echo "${marker.data}" as one typed line.`);
    const output: CastEvent[] = [];
    while (index < events.length && events[index]?.kind === "o") {
      output.push(events[index] as CastEvent);
      index += 1;
    }
    commands.push({ typed: marker.data, enterTime, output });
  }
  return { intro, commands };
}

/**
 * When each character appears, in seconds from the start of typing. Gaps
 * vary a little (0.6× to 1.4×), as a person types, and add up to `duration`
 * including the gap before Enter.
 */
export function typingSchedule(
  characters: number,
  duration: number,
  random: () => number,
): number[] {
  const gaps = Array.from({ length: characters }, () => 0.6 + random() * 0.8);
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  const times: number[] = [];
  let elapsed = 0;
  for (const gap of gaps) {
    times.push(elapsed);
    elapsed += (gap / total) * duration;
  }
  return times;
}

/** mulberry32: a tiny seeded generator, so the same capture always renders the same. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
