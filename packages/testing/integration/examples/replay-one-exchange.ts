import { NoRecordingError, replayTransport } from "../src/index.ts";

/** Replays the exchange once as recorded, then sends a request it doesn't have. Returns what it saw. */
export async function runExample(): Promise<string[]> {
  // A made-up recording: one scenario for the fictional `acme` integration, one scrubbed exchange.
  const replay = replayTransport({
    format: "halonic.recording/1",
    integration: "acme",
    scenario: "list-widgets",
    scrubReport: [{ rule: "secret", path: "request.headers.authorization", count: 1 }],
    exchanges: [
      {
        transport: "http",
        request: {
          method: "GET",
          url: "https://api.acme.example/v1/widgets",
          headers: { authorization: "Bearer <scrubbed:secret>" }, // matches any key on replay
          body: { kind: "empty" },
        },
        response: {
          status: 200,
          headers: {},
          body: { kind: "json", value: { widgets: ["sprocket", "gear"] } },
        },
      },
    ],
  });

  // A match: same method and URL, and the header the recording scrubbed is present. It answers from the recording.
  const reply = await replay.transport.fetch("https://api.acme.example/v1/widgets", {
    headers: { authorization: "Bearer a-made-up-key" },
  });
  const matched = `${reply.status} ${JSON.stringify(await reply.json())}`;

  // A mismatch: the replay fails closed with an error that names no values, and never reaches the network.
  let refused: string;
  try {
    await replay.transport.fetch("https://api.acme.example/v1/gadgets");
    refused = "answered";
  } catch (error) {
    refused = error instanceof NoRecordingError ? error.message : "another error";
  }

  return [matched, refused, `exchanges not asked for: ${replay.unused()}`];
}
