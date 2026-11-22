import { describe, expect, test } from "vitest";
import { formatAnnotation } from "./problems.ts";

describe("formatAnnotation", () => {
  test("writes one plain annotation", () => {
    expect(
      formatAnnotation({
        rule: "lockfile",
        severity: "error",
        file: "a.ts",
        line: 3,
        message: "Bad.",
      }),
    ).toBe("::error file=a.ts,line=3,title=lockfile::Bad.");
  });

  test("keeps a file name or message with line breaks, colons or commas on one line, inside its own field", () => {
    const annotation = formatAnnotation({
      rule: "names",
      severity: "warning",
      file: "docs/a\n::error::b,c:d\r.md",
      message: "50% done\r\nnext",
    });
    expect(annotation).toBe(
      "::warning file=docs/a%0A%3A%3Aerror%3A%3Ab%2Cc%3Ad%0D.md,title=names::50%25 done%0D%0Anext",
    );
    expect(annotation.split(/[\r\n]/)).toHaveLength(1);
  });
});
