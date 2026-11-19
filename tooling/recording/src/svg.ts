import {
  baseCss,
  checkPath,
  colours,
  escapeXml,
  geometry,
  number,
  styleClasses,
  styleHex,
} from "./svg-look.ts";
import type { LineVersion, Span, Tape } from "./tape.ts";

/** A step label in the window bar, and when its command starts being typed. */
export interface StepLabel {
  readonly label: string;
  readonly time: number;
}

/** What the window shows around the session. */
export interface WindowText {
  /** The title in the bar, with the version already filled in. */
  readonly title: string;
  /** What the recording shows, in words: the drawing's accessible name. */
  readonly alt: string;
  readonly steps: readonly StepLabel[];
}

/** One moment of an animated value: from `time` on, `declaration` applies. */
interface Keyframe {
  readonly time: number;
  readonly declaration: string;
}

const doneMark = "✓";

/**
 * Draws the session as an animated SVG that plays once and rests on its
 * last frame. Every element's own style is the last frame; only the
 * animations show the earlier ones. So with reduced motion on, when the
 * animations are switched off, the viewer sees just the last frame.
 */
export function drawAnimated(tape: Tape, window: WindowText): string {
  const animation = new Animation(tape.duration);
  const scroll = animation.play(
    tape.scroll.map((entry) => ({
      time: entry.time,
      declaration: `transform:${scrollTransform(entry.top)}`,
    })),
  );
  const cursor = animation.play(
    tape.cursor.map((entry) => ({
      time: entry.time,
      declaration: `transform:${cursorTransform(entry.line, entry.column)}`,
    })),
  );
  const lines = tape.lines.flatMap((versions, line) =>
    versions.map((version, index) =>
      animatedVersion(animation, line, version, versions[index + 1]),
    ),
  );
  const labels = stepLabels(tape, window.steps).map((label, index) =>
    labelMarkup(label, animation.play(labelKeyframes(window.steps, index, tape.lastOutput))),
  );
  const lastScroll = tape.scroll.at(-1)?.top ?? 0;
  const lastCursor = tape.cursor.at(-1) ?? { line: 0, column: 0 };
  const screen = [
    `<g${classAttribute(scroll)} style="transform:${scrollTransform(lastScroll)}">`,
    ...lines,
    `<g${classAttribute(cursor)} style="transform:${cursorTransform(lastCursor.line, lastCursor.column)}">`,
    cursorBlock("blink"),
    "</g></g>",
  ].join("");
  const css = [
    baseCss,
    ".h{opacity:0}",
    `.a{animation:${number(tape.duration)}s steps(1,end) forwards}`,
    `.blink{animation:blink 1s step-end ${Math.floor(tape.duration)}}@keyframes blink{50%{opacity:0}}`,
    animation.css(),
    "@media (prefers-reduced-motion:reduce){.a,.blink{animation:none}}",
  ].join("");
  return svgDocument(tape, window, css, labels.join(""), screen);
}

/** Draws only the session's last frame: the last 24 rows (or the recording's rows), still. */
export function drawStill(tape: Tape, window: WindowText): string {
  const top = tape.scroll.at(-1)?.top ?? 0;
  const lines: string[] = [];
  for (let line = top; line < Math.min(top + tape.rows, tape.lines.length); line += 1) {
    const last = tape.lines[line]?.at(-1);
    if (last !== undefined && last.spans.length > 0) lines.push(lineMarkup(line, last.spans));
  }
  const cursor = tape.cursor.at(-1) ?? { line: 0, column: 0 };
  const screen = [
    `<g style="transform:${scrollTransform(top)}">`,
    ...lines,
    `<g style="transform:${cursorTransform(cursor.line, cursor.column)}">`,
    cursorBlock(undefined),
    "</g></g>",
  ].join("");
  const labels = stepLabels(tape, window.steps).map((label) => labelMarkup(label, undefined));
  return svgDocument(tape, window, baseCss, labels.join(""), screen);
}

/** Collects the keyframes of every animated element, each under its own name. */
class Animation {
  private readonly rules: string[] = [];
  private readonly duration: number;

  constructor(duration: number) {
    this.duration = duration;
  }

  /** Adds an element's keyframes and returns the classes that play them; none when nothing changes. */
  play(keyframes: readonly Keyframe[]): string | undefined {
    if (keyframes.length <= 1) return undefined;
    const name = `k${this.rules.length}`;
    const frames = keyframes
      .map((keyframe) => `${this.percent(keyframe.time)}{${keyframe.declaration}}`)
      .join("");
    this.rules.push(`.${name}{animation-name:${name}}@keyframes ${name}{${frames}}`);
    return `a ${name}`;
  }

  css(): string {
    return this.rules.join("");
  }

  private percent(time: number): string {
    return `${number((100 * time) / this.duration)}%`;
  }
}

/** One version of a line: shown from its time until the line's next version replaces it. */
function animatedVersion(
  animation: Animation,
  line: number,
  version: LineVersion,
  next: LineVersion | undefined,
): string {
  if (version.spans.length === 0) return "";
  const keyframes: Keyframe[] =
    version.time === 0
      ? [{ time: 0, declaration: "opacity:1" }]
      : [
          { time: 0, declaration: "opacity:0" },
          { time: version.time, declaration: "opacity:1" },
        ];
  if (next !== undefined) keyframes.push({ time: next.time, declaration: "opacity:0" });
  const classes = animation.play(keyframes);
  // `h` hides a version the last frame no longer shows.
  const hidden = next === undefined ? classes : `${classes ?? ""} h`.trim();
  return lineMarkup(line, version.spans, hidden);
}

function lineMarkup(line: number, spans: readonly Span[], classes?: string): string {
  const baseline = geometry.screenTop + line * geometry.lineHeight + geometry.baseline;
  const texts: string[] = [];
  const checks: string[] = [];
  for (const span of spans) {
    const characters = Array.from(span.text);
    const spanClasses = styleClasses(span.style);
    texts.push(
      `<tspan x="${number(columnX(span.column))}" textLength="${number(characters.length * geometry.characterWidth)}"${classAttribute(spanClasses.join(" "))}>`,
      escapeXml(characters.map((character) => (character === doneMark ? " " : character)).join("")),
      "</tspan>",
    );
    characters.forEach((character, index) => {
      if (character !== doneMark) return;
      const pathClasses = spanClasses.includes("f") ? "k f" : "k";
      checks.push(
        `<path class="${pathClasses}" stroke="${styleHex(span.style)}" d="${checkPath(columnX(span.column + index), baseline)}"/>`,
      );
    });
  }
  return `<g${classAttribute(classes)}><text y="${number(baseline)}">${texts.join("")}</text>${checks.join("")}</g>`;
}

interface PlacedLabel {
  readonly label: string;
  readonly x: number;
  readonly width: number;
}

/** The step labels, right-aligned in the window bar, in the order they light up. */
function stepLabels(tape: Tape, steps: readonly StepLabel[]): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  let right = windowWidth(tape) - geometry.barInset;
  for (const step of [...steps].reverse()) {
    const width = Array.from(step.label).length * geometry.barCharacterWidth;
    placed.unshift({ label: step.label, x: right - width, width });
    right -= width + geometry.stepGap;
  }
  return placed;
}

/** A label lights up when its command is typed, dims at the next step, and all are lit at the end. */
function labelKeyframes(steps: readonly StepLabel[], index: number, end: number): Keyframe[] {
  const lit = `fill:${colours.text}`;
  const dim = `fill:${colours.dim}`;
  const start = steps[index]?.time ?? 0;
  const next = steps[index + 1]?.time;
  const keyframes: Keyframe[] = [{ time: 0, declaration: start === 0 ? lit : dim }];
  if (start > 0) keyframes.push({ time: start, declaration: lit });
  if (next !== undefined) keyframes.push({ time: next, declaration: dim });
  keyframes.push({ time: end, declaration: lit });
  return keyframes;
}

function labelMarkup(label: PlacedLabel, animationClasses: string | undefined): string {
  const classes = [animationClasses, "t l"].filter((part) => part !== undefined).join(" ");
  return `<text x="${number(label.x)}" y="${geometry.barTextBaseline}" textLength="${number(label.width)}" class="${classes}">${escapeXml(label.label)}</text>`;
}

function cursorBlock(classes: string | undefined): string {
  return `<rect${classAttribute(classes)} y="1" width="${geometry.characterWidth}" height="${geometry.lineHeight - 2}" fill="${colours.text}" fill-opacity=".7"/>`;
}

function svgDocument(
  tape: Tape,
  window: WindowText,
  css: string,
  labels: string,
  screen: string,
): string {
  const width = windowWidth(tape);
  const screenHeight = tape.rows * geometry.lineHeight;
  const height = geometry.screenTop + screenHeight + geometry.screenBottomPadding;
  const alt = escapeXml(window.alt);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${height}" viewBox="0 0 ${number(width)} ${height}" role="img" aria-label="${alt}">`,
    `<title>${alt}</title><style>${css}</style>`,
    `<clipPath id="screen"><rect x="0" y="${geometry.screenTop}" width="${number(width)}" height="${screenHeight}"/></clipPath>`,
    `<rect x=".5" y=".5" width="${number(width - 1)}" height="${height - 1}" rx="12" fill="${colours.window}" stroke="${colours.border}"/>`,
    `<path d="M1 ${geometry.barLine}H${number(width - 1)}" stroke="${colours.barLine}"/>`,
    `<text class="t" x="${geometry.barInset}" y="${geometry.barTextBaseline}">${escapeXml(window.title)}</text>`,
    labels,
    `<g clip-path="url(#screen)">${screen}</g></svg>\n`,
  ].join("");
}

function windowWidth(tape: Tape): number {
  return geometry.screenLeft * 2 + tape.columns * geometry.characterWidth;
}

function columnX(column: number): number {
  return geometry.screenLeft + column * geometry.characterWidth;
}

function scrollTransform(top: number): string {
  return translate(0, -top * geometry.lineHeight);
}

function cursorTransform(line: number, column: number): string {
  return translate(columnX(column), geometry.screenTop + line * geometry.lineHeight);
}

function translate(x: number, y: number): string {
  return `translate(${number(x)}px,${number(y)}px)`;
}

function classAttribute(classes: string | undefined): string {
  return classes === undefined || classes === "" ? "" : ` class="${classes}"`;
}
