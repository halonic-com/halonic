import type { IncomingMessage, ServerResponse } from "node:http";
import { formatPath, parse, type Schema } from "@halonicjs/schema-kit";
import { sendError } from "./host-server.ts";

/**
 * The largest request body the host reads. A sandbox profile, the largest
 * body today, is a few kilobytes; this leaves room without letting a caller
 * fill the host's memory.
 */
export const maxBodyBytes = 1024 * 1024;

/** Why a request body couldn't be read, as the error's `kind` in the answer. */
export type BodyProblem = "body_too_large" | "body_not_json";

/** A request body the host can't read. The route answers it with {@link bodyProblemStatus}. */
export class BodyError extends Error {
  readonly problem: BodyProblem;

  constructor(problem: BodyProblem) {
    super(
      problem === "body_too_large"
        ? `The request body is larger than ${maxBodyBytes} bytes.`
        : "The request body is not JSON.",
    );
    this.name = "BodyError";
    this.problem = problem;
  }
}

export const bodyProblemStatus: Record<BodyProblem, number> = {
  body_too_large: 413,
  body_not_json: 400,
};

/**
 * Reads the request's body as JSON. Refuses a body whose `Content-Length` is
 * over {@link maxBodyBytes} before reading any of it, so a caller can't hold
 * the request open by promising a body it never sends. A body without a
 * length (chunked) is counted as it arrives, and reading stops as soon as it
 * passes the limit.
 *
 * @throws {BodyError} when the body is too large or not JSON
 */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (Number(request.headers["content-length"] ?? 0) > maxBodyBytes) {
    throw new BodyError("body_too_large");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new BodyError("body_too_large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new BodyError("body_not_json");
  }
}

/**
 * Reads the request's body and checks it against `schema`. When it can't, it
 * answers the request with the reason (413 or 400, listing every problem with
 * its path) and returns `undefined`, so the route only has to stop.
 */
export async function readCheckedBody<T>(
  request: IncomingMessage,
  response: ServerResponse,
  schema: Schema<T>,
): Promise<T | undefined> {
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (!(error instanceof BodyError)) throw error;
    // The caller may still be sending: close the connection once the answer is out.
    response.shouldKeepAlive = false;
    sendError(response, bodyProblemStatus[error.problem], error.problem, error.message);
    return undefined;
  }
  const parsed = parse(schema, body);
  if (parsed.ok) return parsed.value as T;
  const problems = parsed.error.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
  sendError(response, 400, "body_invalid", `The request body is not valid. ${problems.join("; ")}`);
  return undefined;
}
