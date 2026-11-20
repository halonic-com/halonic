/**
 * Right after a deploy, Cloudflare's edge servers learn a new workers.dev address one by one, so
 * for a while some requests get the edge's own not-found page while others reach the Worker
 * (HAL-14022). The test runner and the live checks both ask again on that page, the same way.
 */

/** Tries while the edge answers not found: waits of 1, 2, 4 and then 8 s, about 40 s. */
export const edgeAttempts = 8;

const longestWaitMs = 8_000;

/**
 * Whether the answer is Cloudflare's own HTML "Page not found" rather than the Worker's: an edge
 * server that doesn't route the new workers.dev address yet. A Worker's own 404 is never HTML.
 */
export function isEdgeNotFound(response: Response): boolean {
  return (
    response.status === 404 && (response.headers.get("content-type") ?? "").includes("text/html")
  );
}

/**
 * How long to wait after the edge's not-found page before asking again.
 *
 * @param attempt - the try that got the page, counting from 1
 */
export function edgeWaitMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), longestWaitMs);
}
