// Shared by the GitHub definitions' tests. It imports no testing package,
// since only `*.test.ts` files may (the layers check): each test builds its
// `FakeActionSender` from these pieces.

interface RecordedBody {
  kind: string;
  value?: unknown;
}

/** The parts of a `halonic.recording/1` file the GitHub tests replay. */
export interface GithubRecording {
  format: string;
  exchanges: readonly {
    request: { method: string; url: string; body: RecordedBody };
    response: { status: number; body: RecordedBody };
  }[];
}

/** One answer for the fake sender, or `unreachable` once the recording runs out. */
export type RecordedAnswer =
  | { status: number; fields: Record<string, unknown>; error?: string }
  | "unreachable";

/** Reads a recording's text and checks it is a `halonic.recording/1` file. Tests only. */
export function parseGithubRecording(text: string): GithubRecording {
  const recording = JSON.parse(text) as GithubRecording;
  if (recording.format !== "halonic.recording/1") throw new Error("not halonic.recording/1");
  return recording;
}

/** The recorded requests, as the fake sender's `sent` lists them. Tests only. */
export function recordedCalls(recording: GithubRecording): Record<string, unknown>[] {
  return recording.exchanges.map(({ request }) => {
    const path = request.url.slice("https://api.github.com".length);
    const call: Record<string, unknown> = { service: "github", method: request.method, path };
    if (request.body.kind === "json") call["body"] = request.body.value;
    return call;
  });
}

/** Answers each call with the recording's next response, GitHub's `message` as the error. Tests only. */
export function recordedAnswers(recording: GithubRecording): () => RecordedAnswer {
  let next = 0;
  return () => {
    const exchange = recording.exchanges[next++];
    if (exchange === undefined) return "unreachable";
    const body = exchange.response.body;
    const fields = body.kind === "json" ? (body.value as Record<string, unknown>) : {};
    const message = fields["message"];
    const status = exchange.response.status;
    return typeof message === "string" ? { status, fields, error: message } : { status, fields };
  };
}
