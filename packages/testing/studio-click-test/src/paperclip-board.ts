import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const challengesPath = "/api/cli-auth/challenges";

/** The throwaway Paperclip as the click test sees it: Studio's address for it, and its board. */
export interface PaperclipBoard {
  /** The address Studio connects to: a recording proxy in front of the Paperclip. */
  readonly address: string;
  /** Approves the newest sign-in Studio started; resolves to why it couldn't, or undefined. */
  approveSignIn(
    waitMs: number,
    sleep: (milliseconds: number) => Promise<void>,
  ): Promise<string | undefined>;
  /** Stops the proxy. */
  close(): Promise<void>;
}

interface Challenge {
  readonly id: string;
  readonly token: string;
}

/**
 * Starts a proxy on loopback in front of the Paperclip at `paperclipUrl`.
 * Studio opens the approval page in a browser, and only that page's address
 * carries the challenge's secret, so the proxy keeps the id and secret from
 * Paperclip's answer when Studio creates the challenge. The board then
 * approves it through Paperclip's own route, which a loopback Paperclip in
 * `local_trusted` mode allows without a key.
 */
export async function startPaperclipBoard(paperclipUrl: string): Promise<PaperclipBoard> {
  const target = paperclipUrl.replace(/\/$/, "");
  const challenges: Challenge[] = [];
  const server = createServer((request, response) => {
    forward(target, request, response, challenges).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      response.writeHead(502, { "content-type": "text/plain" }).end(`proxy: ${message}`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const bound = server.address();
  const port = typeof bound === "object" && bound !== null ? bound.port : 0;
  return {
    address: `http://127.0.0.1:${port}`,
    approveSignIn: async (waitMs, sleep) => {
      for (let waited = 0; challenges.length === 0 && waited < waitMs; waited += 1_000)
        await sleep(1_000);
      const challenge = challenges.at(-1);
      if (challenge === undefined) return "Studio started no sign-in on the test Paperclip.";
      const url = `${target}${challengesPath}/${encodeURIComponent(challenge.id)}/approve`;
      const answer = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: challenge.token }),
      });
      if (answer.ok) return undefined;
      return `Paperclip refused the approval: HTTP ${answer.status} ${await answer.text()}`;
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function forward(
  target: string,
  request: IncomingMessage,
  response: ServerResponse,
  challenges: Challenge[],
): Promise<void> {
  const body = await readAll(request);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string" && name !== "host" && name !== "connection")
      headers.set(name, value);
  }
  const init: RequestInit = { method: request.method ?? "GET", headers, redirect: "manual" };
  if (body.length > 0) init.body = body;
  const answer = await fetch(`${target}${request.url ?? "/"}`, init);
  const answerBody = new Uint8Array(await answer.arrayBuffer());
  if (request.method === "POST" && request.url === challengesPath && answer.status === 201) {
    const created = readChallenge(answerBody);
    if (created !== undefined) challenges.push(created);
  }
  const outHeaders: Record<string, string> = {};
  answer.headers.forEach((value, name) => {
    // fetch already undid the transfer and content encodings.
    if (name !== "content-encoding" && name !== "content-length" && name !== "transfer-encoding")
      outHeaders[name] = value;
  });
  response.writeHead(answer.status, outHeaders).end(answerBody);
}

function readChallenge(body: Uint8Array): Challenge | undefined {
  const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const { id, token } = parsed as Record<string, unknown>;
  return typeof id === "string" && typeof token === "string" ? { id, token } : undefined;
}

async function readAll(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks);
}
