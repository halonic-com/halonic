import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import type { Cast } from "./asciicast.ts";
import { drawAnimated, drawStill, type WindowText } from "./svg.ts";
import { playCast } from "./terminal.ts";

function tapeOf(outputs: readonly (readonly [number, string])[], width = 20, height = 3) {
  const cast: Cast = {
    header: { version: 2, width, height, duration: 10 },
    events: outputs.map(([time, data]) => ({ time, kind: "o", data })),
  };
  return playCast(cast);
}

const window: WindowText = {
  title: "Terminal · Halonic 0.1.0",
  alt: "A terminal: echo says <hi> & stops.",
  steps: [
    { label: "1 Ask", time: 1 },
    { label: "2 Answer", time: 4 },
  ],
};

verifies("recording.svg", () => {
  describe("drawAnimated", () => {
    const tape = tapeOf([
      [0, "~ $ "],
      [1, "e"],
      [2, "\r\nfirst\r\nsecond\r\nthird"],
      [7, "\r\n~ $ "],
    ]);
    const svg = drawAnimated(tape, window);

    test("gives every element the last frame as its own style; only the animation shows earlier frames", () => {
      // The prompt before "e" was typed is replaced, so it is hidden unless the animation shows it.
      expect(svg).toMatch(
        /<g class="a k\d+ h"><text y="69"><tspan x="20" textLength="25.2">~ \$<\/tspan>/,
      );
      // Its last version stays visible.
      expect(svg).toMatch(
        /<g class="a k\d+"><text y="69"><tspan x="20" textLength="42">~ \$ e<\/tspan>/,
      );
      // The session scrolled by two lines; the scroll group and the cursor rest there.
      expect(svg).toContain('<g class="a k0" style="transform:translate(0px,-40px)">');
      expect(svg).toContain(
        "@keyframes k0{0%{transform:translate(0px,0px)}20%{transform:translate(0px,-20px)}",
      );
      expect(svg).toContain('style="transform:translate(53.6px,134px)"><rect class="blink"');
    });

    test("plays once, then rests, and stops moving when reduced motion is on", () => {
      expect(svg).toContain(".a{animation:10s steps(1,end) forwards}");
      expect(svg).toContain("@media (prefers-reduced-motion:reduce){.a,.blink{animation:none}}");
    });

    test("lights each step label while its command runs, and all of them at the end", () => {
      expect(svg).toContain(
        "@keyframes k8{0%{fill:#8196b6}10%{fill:#e6edf7}40%{fill:#8196b6}70%{fill:#e6edf7}}",
      );
      expect(svg).toContain('<text x="84" y="22" textLength="36" class="a k8 t l">1 Ask</text>');
    });

    test("names the drawing with the recording's words, made safe for XML", () => {
      expect(svg).toContain('aria-label="A terminal: echo says &lt;hi&gt; &amp; stops."');
      expect(svg).toContain("<title>A terminal: echo says &lt;hi&gt; &amp; stops.</title>");
      expect(svg).toContain('<text class="t" x="16" y="22">Terminal · Halonic 0.1.0</text>');
    });
  });

  describe("drawStill", () => {
    test("holds just the last frame's rows, with no animation", () => {
      const tape = tapeOf([[0, "gone\r\nkept 1\r\nkept 2\r\nkept 3"]]);
      const svg = drawStill(tape, window);
      expect(svg).not.toContain("gone");
      expect(svg).toContain("kept 1");
      expect(svg).toContain("kept 3");
      expect(svg).not.toContain("animation");
      expect(svg).toContain('class="t l">2 Answer</text>');
    });
  });

  describe("colours and marks", () => {
    test("draws green in the success teal and yellow in the waiting violet", () => {
      const svg = drawStill(tapeOf([[0, "\x1b[32mdone\x1b[39m \x1b[33m!\x1b[39m"]]), window);
      expect(svg).toContain('class="g">done</tspan>');
      expect(svg).toContain('class="w">!</tspan>');
      expect(svg).toContain(".g{fill:#14b8a2}");
      expect(svg).toContain(".w{fill:#d380fe}");
    });

    test("draws the done mark as a small check in the same colour, not as a glyph", () => {
      const svg = drawStill(tapeOf([[0, "\x1b[32m✓\x1b[39m ok"]]), window);
      expect(svg).not.toContain("✓");
      expect(svg).toContain('<tspan x="20" textLength="8.4" class="g"> </tspan>');
      expect(svg).toContain('<path class="k" stroke="#14b8a2" d="M21.2 64L23.4 66.6L27.2 60.4"/>');
    });

    test("stops at a colour it has no house colour for, naming it", () => {
      expect(() => drawStill(tapeOf([[0, "\x1b[35mx"]]), window)).toThrow(
        "The drawing has no colour for ANSI colour 5 (magenta).",
      );
    });
  });
});
