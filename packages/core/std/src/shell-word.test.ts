import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { shellWord } from "./shell-word.ts";

verifies("std.shell-word", () => {
  it.each([
    ["acme", "acme"],
    ["/acme/sam/acme-v2.0", "/acme/sam/acme-v2.0"],
    ["/acme/Documents/Acme sample", '"/acme/Documents/Acme sample"'],
    ['acme"name', '"acme\\"name"'],
    ["acme$name", '"acme\\$name"'],
    ["acme`name", '"acme\\`name"'],
    ["acme\\name", '"acme\\\\name"'],
    ["", '""'],
  ])("writes %j as %s", (text, word) => {
    expect(shellWord(text)).toBe(word);
  });
});
