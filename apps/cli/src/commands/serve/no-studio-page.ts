// Whether `halonic serve` has the Studio page to serve, and what a browser sees
// at `/` when it runs from the npm package, which doesn't ship the page
// (HAL-19285). Without this, a new user who opens the address sees the API's
// JSON 404, so a browser asking for a page gets a short page with the line
// `serve` prints instead.

import { access } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "@halonicjs/host-server";
import { noStudioPage } from "../../messages/no-studio-page.ts";

/** Nothing for the page to load: it has no script, style, image or frame. */
const pageCsp = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Whether the Studio page's entry is there to serve. */
export async function studioPageIsBuilt(studioFolder: string): Promise<boolean> {
  return access(join(studioFolder, "studio.html")).then(
    () => true,
    () => false,
  );
}

/**
 * `server` as it is when the npm package's missing page isn't the case
 * (`noPage` false). Else `server`, with a browser's `GET /` (or `HEAD /`) that
 * asks for HTML and would get a 404 answered by a plain page saying how to
 * open the workspace; `reachable` as for `serveMessages.studioNotInPackage`.
 * Every other path, and a request that doesn't ask for HTML, gets the
 * server's own answer, so a script still reads the JSON it reads today.
 *
 * @example
 * answerBrowserWithoutStudio(server, true, true);
 * // GET / with "Accept: text/html" → 200, "<p>Open it from the Halonic app for Android: …</p>"
 */
export function answerBrowserWithoutStudio(
  server: Server,
  noPage: boolean,
  reachable: boolean,
): Server {
  if (!noPage) return server;
  return {
    async handle(request, context) {
      const response = await server.handle(request, context);
      if (response.status !== 404 || !asksForThePage(request)) return response;
      const page = noStudioPage(reachable);
      return new Response(request.method === "HEAD" ? null : page, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Length": String(new TextEncoder().encode(page).byteLength),
          "Content-Security-Policy": pageCsp,
        },
      });
    },
  };
}

/** A browser opening the address: a read of `/` that accepts HTML. */
function asksForThePage(request: Request): boolean {
  const isRead = request.method === "GET" || request.method === "HEAD";
  const accept = request.headers.get("Accept") ?? "";
  return isRead && new URL(request.url).pathname === "/" && accept.includes("text/html");
}
