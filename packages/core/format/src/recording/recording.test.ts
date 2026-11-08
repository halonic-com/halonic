import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse } from "@halonicjs/schema-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as root from "../index.ts";
import {
  formatRecording,
  RECORDING_FORMAT,
  type RecordingFile,
  recordingFileSchema,
} from "./index.ts";

/** Recordings from halonic-com/integrations (59ad3dd), copied as they are. */
const fixtures = [
  "knowledge-mcp-search-text",
  "model-anthropic-stream-text",
  "model-openai-key-refused",
  "tool-google-drive-create-file",
  "tool-mcp-http-call-tool",
];

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.json`), "utf8");
}

/** A small valid recording with one exchange; each refusal test breaks one value of it. */
function recording(): RecordingFile {
  return {
    format: RECORDING_FORMAT,
    integration: "weather",
    scenario: "forecast",
    exchanges: [
      {
        transport: "http",
        request: {
          method: "POST",
          url: "https://api.example.com/v1/forecast",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: { kind: "form", value: [["city", "<scrubbed:content>"]] },
        },
        response: { status: 200, headers: {}, body: { kind: "empty" } },
      },
    ],
    scrubReport: [{ rule: "user-content", path: "request.body.city", count: 1 }],
  };
}

/** The relative files `entry` imports, followed transitively, and every package it imports. */
function importsOf(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) {
      return;
    }
    files.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)) {
      if (specifier === undefined) {
        continue;
      }
      if (specifier.startsWith(".")) {
        visit(resolve(dirname(file), specifier));
      } else {
        packages.add(specifier);
      }
    }
  };
  visit(entry);
  return { files: [...files], packages: [...packages] };
}

verifies("format.recording-file", () => {
  it.each(fixtures)("reads the %s recording and writes it back byte for byte", (name) => {
    const text = fixture(name);
    const parsed = parse(recordingFileSchema, JSON.parse(text));
    expect(parsed.ok && formatRecording(parsed.value)).toBe(text);
  });

  it("reads a form body", () => {
    expect(parse(recordingFileSchema, recording()).ok).toBe(true);
  });

  it.each<[string, (file: Record<string, unknown> & RecordingFile) => void, string]>([
    ["another format", (file) => Object.assign(file, { format: "halonic.recording/2" }), "format"],
    ["an unknown key", (file) => Object.assign(file, { note: "x" }), ""],
    [
      "an upper-case header",
      (file) => Object.assign(exchange(file).request.headers, { Accept: "*/*" }),
      "exchanges.0.request.headers.Accept",
    ],
    [
      "a lower-case method",
      (file) => Object.assign(exchange(file).request, { method: "post" }),
      "exchanges.0.request.method",
    ],
    [
      "a URL that isn't http",
      (file) => Object.assign(exchange(file).request, { url: "file:///etc/passwd" }),
      "exchanges.0.request.url",
    ],
    [
      "a status under 100",
      (file) => Object.assign(exchange(file).response, { status: 99 }),
      "exchanges.0.response.status",
    ],
    [
      "an unknown body kind",
      (file) => Object.assign(exchange(file).response, { body: { kind: "xml" } }),
      "exchanges.0.response.body.kind",
    ],
    [
      "an unknown transport",
      (file) => Object.assign(exchange(file), { transport: "stdio" }),
      "exchanges.0.transport",
    ],
    [
      "a scrub count of 0",
      (file) => Object.assign(file.scrubReport[0] ?? {}, { count: 0 }),
      "scrubReport.0.count",
    ],
  ])("refuses %s", (_name, breakIt, path) => {
    const file = recording() as Record<string, unknown> & RecordingFile;
    breakIt(file);
    const parsed = parse(recordingFileSchema, file);
    expect(parsed.ok ? [] : parsed.error.map((issue) => issue.path.join("."))).toEqual([path]);
  });

  it("sorts keys at every level and keeps the order of lists", () => {
    const file = recording();
    file.exchanges.push({
      ...exchange(file),
      request: { ...exchange(file).request, method: "GET" },
    });
    const text = formatRecording(file);
    expect(text.indexOf('"exchanges"')).toBeLessThan(text.indexOf('"format"'));
    expect(text.indexOf('"body"')).toBeLessThan(text.indexOf('"headers"'));
    expect(text.indexOf('"POST"')).toBeLessThan(text.indexOf('"GET"'));
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("loads no yaml: the entry imports only schema-kit, never parse-file.ts", () => {
    const { files, packages } = importsOf(join(import.meta.dirname, "index.ts"));
    expect(packages).toEqual(["@halonicjs/schema-kit"]);
    expect(files.some((file) => file.endsWith("parse-file.ts"))).toBe(false);
  });

  it("is not exported from the package's main entry point", () => {
    expect(Object.keys(root)).not.toContain("recordingFileSchema");
    expect(Object.keys(root)).not.toContain("formatRecording");
  });
});

function exchange(file: RecordingFile): RecordingFile["exchanges"][number] {
  const first = file.exchanges[0];
  if (first === undefined) {
    expect.fail("the recording has no exchange");
  }
  return first;
}
