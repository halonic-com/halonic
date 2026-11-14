/** The body of every refusal: a code and a short message, the same shape as `host/server`'s errors. */
interface RefusalBody {
  readonly code: string;
  readonly message: string;
}

function refusal(status: number, body: RefusalBody, headers?: Record<string, string>): Response {
  return Response.json(body, headers === undefined ? { status } : { status, headers });
}

export const healthPath = "/health";

/**
 * Answers a request without the API behind it (HAL-6802): the health route, and a 404 for the rest. Only
 * `GET` and `HEAD` on `/health` answer, with 200 and `{"status":"ok"}`: no
 * version, no configuration, no names of what is bound, so a caller who isn't
 * signed in learns nothing about the deployment. Every other path is 404 and
 * every other method on `/health` is 405. No Studio file is served until the
 * API behind it exists.
 */
export function answerRequest(request: Request): Response {
  const { pathname } = new URL(request.url);
  if (pathname !== healthPath) {
    return refusal(404, { code: "not_found", message: "There is nothing at this address." });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return refusal(
      405,
      { code: "method_not_allowed", message: "This address only answers GET." },
      { allow: "GET, HEAD" },
    );
  }
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
