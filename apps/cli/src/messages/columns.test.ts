import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import { columns, columnsAs } from "./columns.ts";
import { dim, markPart, type Phrase, phrase, plainText, renderPhrase } from "./phrase.ts";

const piped = paintFor({ colour: false, live: false, unicode: true });
const oldConsole = paintFor({ colour: false, live: false, unicode: false });

function shown(lines: readonly Phrase[], paint = piped): string[] {
  return lines.map((line) => renderPhrase(line, paint));
}

verifies("cli.columns", () => {
  it("makes each column as wide as its longest entry, with three spaces between", () => {
    const lines = columns([
      [phrase`${markPart("done")} Done`, phrase`01jd8q`],
      [phrase`${markPart("needsYou")} Needs you`, phrase`01jd9a`],
    ]);
    expect(shown(lines)).toEqual(["✓ Done        01jd8q", "! Needs you   01jd9a"]);
  });

  it("lines the columns up without UTF-8, where a mark's stand-in is wider", () => {
    const lines = columns([
      [phrase`${markPart("done")} Done`, phrase`01jd8q`],
      [phrase`${markPart("working")} Running`, phrase`01jd9c`],
    ]);
    expect(shown(lines, oldConsole)).toEqual(["ok Done      01jd8q", ".. Running   01jd9c"]);
    expect(shown(lines)).toEqual(["✓ Done      01jd8q", "◌ Running   01jd9c"]);
  });

  it("pads no line at its end, and keeps each cell's own styling", () => {
    const lines = columns([
      [phrase`Support reply`, phrase`${dim("10:31")}`],
      [phrase`Mail triage`, phrase`${dim("yesterday 16:40")}`],
    ]);
    expect(lines.map(plainText)).toEqual([
      "Support reply   10:31",
      "Mail triage     yesterday 16:40",
    ]);
    expect(lines[1]?.at(-1)).toEqual(dim("yesterday 16:40"));
  });

  it("makes no lines from no rows", () => {
    expect(columns([])).toEqual([]);
  });
});

verifies("cli.run-live", () => {
  it("takes the widths from other rows, so a line printed early never needs widening", () => {
    const widthRows = [
      [phrase`${markPart("done")} Approve this reply?`],
      [phrase`${markPart("done")} Read the email`, phrase`Writer`],
    ];
    const lines = columnsAs(
      [[phrase`${markPart("done")} Read the email`, phrase`Writer`, phrase`1 s`]],
      widthRows,
    );
    expect(shown(lines)).toEqual(["✓ Read the email        Writer   1 s"]);
    expect(shown(lines, oldConsole)).toEqual(["ok Read the email        Writer   1 s"]);
  });

  it("gives a cell wider than its column the three spaces still", () => {
    const lines = columnsAs([[phrase`An agent that is gone`, phrase`1 s`]], [[phrase`Writer`]]);
    expect(shown(lines)).toEqual(["An agent that is gone   1 s"]);
  });
});
