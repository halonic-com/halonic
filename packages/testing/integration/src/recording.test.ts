import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { checkCase } from "./checks.ts";
import { forecastExchange, recording, weatherSubject } from "./fixtures/weather.ts";
import {
  NoRecordingError,
  type RecordedBody,
  type RecordingFile,
  replayTransport,
} from "./recording.ts";

const file: RecordingFile = {
  format: "halonic.recording/1",
  integration: "notes",
  scenario: "create-and-delete",
  scrubReport: [{ rule: "user-content", path: "request.body.text", count: 1 }],
  exchanges: [
    {
      transport: "http",
      request: {
        method: "POST",
        url: "https://api.example.com/v1/items?key=%3Cscrubbed%3Asecret%3E",
        headers: { authorization: "Bearer <scrubbed:secret>", "content-type": "application/json" },
        body: {
          kind: "json",
          value: { text: "<scrubbed:content>", pinned: false, size: 0, tag: "x" },
        },
      },
      response: {
        status: 201,
        headers: { "x-id": "7" },
        body: { kind: "json", value: { id: "scrubbed-secret-1" } },
      },
    },
    {
      transport: "http",
      request: {
        method: "DELETE",
        url: "https://api.example.com/v1/items/scrubbed-secret-1",
        headers: {},
        body: { kind: "empty" },
      },
      response: { status: 204, headers: {}, body: { kind: "empty" } },
    },
  ],
};

const create = {
  method: "post",
  body: JSON.stringify({ tag: "x", size: 12, pinned: true, text: "Buy milk" }),
  headers: { authorization: "Bearer placed-by-kit", "content-type": "application/json" },
};

verifies("integration.recordings-fail-closed", () => {
  it("answers in order on method and URL, with placeholders matching any value", async () => {
    const { transport, seen, unused } = replayTransport(file);
    const made = await transport.fetch("https://API.example.com/v1/items?key=real-key", create);
    expect([made.status, made.headers.get("x-id"), await made.json()]).toEqual([
      201,
      "7",
      { id: "scrubbed-secret-1" },
    ]);
    expect(seen.at(-1)?.headers["authorization"]).toBe("Bearer placed-by-kit");
    expect(unused()).toBe(1);
    const gone = await transport.fetch("https://api.example.com/v1/items/scrubbed-secret-1", {
      method: "DELETE",
    });
    expect(gone.status).toBe(204);
    expect(unused()).toBe(0);
  });

  it.each([
    ["the wrong method", { ...create, method: "PUT" }, "expects POST"],
    ["a field the recording doesn't have", { ...create, body: '{"tag":"x","extra":1}' }, "body"],
    ["a different kept value", { ...create, body: create.body.replace('"x"', '"y"') }, "body"],
    ["no key where the recording kept one", { ...create, headers: {} }, "authorization header"],
  ])("refuses a request with %s", async (_what, init, why) => {
    const { transport } = replayTransport(file);
    await expect(
      transport.fetch("https://api.example.com/v1/items?key=real-key", init),
    ).rejects.toThrow(why);
  });

  it("refuses a request out of order or past the end, naming host and path only", async () => {
    const { transport } = replayTransport(file);
    const outOfOrder = transport.fetch(
      "https://api.example.com/v1/items/scrubbed-secret-1?q=private",
      {
        method: "DELETE",
      },
    );
    await expect(outOfOrder).rejects.toThrow(NoRecordingError);
    await expect(outOfOrder).rejects.toThrow(
      /^no recording for DELETE api\.example\.com\/v1\/items\/scrubbed-secret-1 as request 1/,
    );
    await expect(outOfOrder).rejects.not.toThrow("private");

    const empty = replayTransport(undefined);
    await expect(empty.transport.fetch("https://api.example.com/")).rejects.toThrow(
      "the recording has no more exchanges",
    );
  });

  it("replays a streamed answer as server-sent events", async () => {
    const { transport } = replayTransport({
      ...file,
      exchanges: [
        {
          transport: "http",
          request: {
            method: "GET",
            url: "https://api.example.com/stream",
            headers: {},
            body: { kind: "empty" },
          },
          response: {
            status: 200,
            headers: {},
            body: {
              kind: "sse",
              value: [
                { event: "delta", data: { text: "<scrubbed:content>" } },
                { event: "message", data: "[DONE]" },
              ],
            },
          },
        },
      ],
    });
    const response = await transport.fetch("https://api.example.com/stream");
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(await response.text()).toBe(
      'event: delta\ndata: {"text":"<scrubbed:content>"}\n\ndata: [DONE]\n\n',
    );
  });

  it.each([
    ["another host", "https://other.example.com/v1/items?key=real-key", create, "api.example.com"],
    ["a changed query", "https://api.example.com/v1/items?key=real-key&all=1", create, "query"],
    [
      "a body that isn't JSON",
      "https://api.example.com/v1/items?key=real-key",
      { ...create, body: "{" },
      "body",
    ],
    [
      "an array where the recording has an object",
      "https://api.example.com/v1/items?key=real-key",
      { ...create, body: "[]" },
      "body",
    ],
    [
      "null where the recording kept a value",
      "https://api.example.com/v1/items?key=real-key",
      { ...create, body: create.body.replace('"x"', "null") },
      "body",
    ],
  ])("refuses a request to %s", async (_what, url, init, why) => {
    const { transport } = replayTransport(file);
    await expect(transport.fetch(url, init)).rejects.toThrow(why);
  });

  it("matches form and text bodies, with placeholders, and never a streamed one", async () => {
    const sending = (body: RecordedBody): RecordingFile => ({
      ...file,
      exchanges: [
        {
          transport: "http",
          request: { method: "POST", url: "https://api.example.com/send", headers: {}, body },
          response: { status: 200, headers: {}, body: { kind: "empty" } },
        },
      ],
    });
    const send = (body: RecordedBody, sent: string) =>
      replayTransport(sending(body)).transport.fetch("https://api.example.com/send", {
        method: "POST",
        body: sent,
      });

    const form: RecordedBody = {
      kind: "form",
      value: [
        ["action", "save"],
        ["note", "<scrubbed:content>"],
      ],
    };
    await expect(send(form, "action=save&note=Ghent")).resolves.toBeDefined();
    await expect(send(form, "action=delete&note=Ghent")).rejects.toThrow("body");

    const text: RecordedBody = {
      kind: "text",
      contentType: "text/plain",
      value: "to <scrubbed:content>.",
    };
    await expect(send(text, "to Ghent.")).resolves.toBeDefined();
    await expect(send(text, "to Ghent!")).rejects.toThrow("body");

    const streamed: RecordedBody = { kind: "sse", value: [{ event: "message", data: "hi" }] };
    await expect(send(streamed, "data: hi\n\n")).rejects.toThrow("body");
  });

  it("replays a form answer with its content type", async () => {
    const { transport } = replayTransport({
      ...file,
      exchanges: [
        {
          transport: "http",
          request: {
            method: "GET",
            url: "https://api.example.com/saved",
            headers: {},
            body: { kind: "empty" },
          },
          response: {
            status: 200,
            headers: {},
            body: {
              kind: "form",
              value: [
                ["id", "7"],
                ["status", "saved"],
              ],
            },
          },
        },
      ],
    });
    const response = await transport.fetch("https://api.example.com/saved");
    expect(response.headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    expect(await response.text()).toBe("id=7&status=saved");
  });

  it("fails a case that makes fewer requests than its recording has", async () => {
    const answer = forecastExchange({ kind: "json", value: { summary: "Rain, 12°C" } });
    const subject = {
      ...weatherSubject,
      recordings: [recording("forecast-ghent", [answer, answer])],
    };
    const forecastCase = { tool: "forecast", scenario: "forecast-ghent", args: { city: "Ghent" } };

    await expect(checkCase(subject, forecastCase)).rejects.toThrow(
      /"forecast" made 1 request\(s\) fewer than the recording "forecast-ghent" has/,
    );
  });

  it("refuses a file in another format", () => {
    const old = { ...file, format: "halonic.recording/0" } as unknown as RecordingFile;
    expect(() => replayTransport(old)).toThrow("is not halonic.recording/1");
  });
});
