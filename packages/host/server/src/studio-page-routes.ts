import type { StudioPage } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";

/** The page's entry in the built folder: what Vite writes for `studio.html`. `GET /` serves it. */
export const studioEntry = "studio.html";

/**
 * What the Studio page may load, and nothing else: its own scripts and style
 * sheet, images and fonts from this server, and calls and the event stream to
 * this server. No inline script or style, no other site, no frame, no form to
 * another address. The page is built into files (`vite build --mode studio`),
 * so it needs none of those.
 */
export const studioPageCsp = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * The kinds of file the page is built from. The server names the type from the
 * extension and never from the host, and a file of any other kind isn't served.
 */
const contentTypes: Readonly<Record<string, string>> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  woff2: "font/woff2",
};

/** One name of a file path: letters, digits, dot, dash and underscore, and no leading dot, so never `.` or `..`. */
const segmentPattern = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;

export interface StudioPageRoutes {
  /**
   * Answers a `GET` or `HEAD` for a page file, or `null` for any other
   * request, so the other routes answer it. A missing or refused file answers
   * 404, with the same body as any address with nothing at it.
   */
  serve(request: Request): Promise<Response | null>;
}

/** Whether a path belongs to the API, which the page never shadows. */
function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * The file a path asks for, relative to the built folder, or `null` for a path
 * that names none we serve. Only plain names, joined by `/`, pass: no
 * percent-encoding, backslash, empty or dotted segment, so a path can't climb
 * out of the folder however a host reads it.
 */
export function pageFileOf(pathname: string): string | null {
  if (pathname === "/") return studioEntry;
  const segments = pathname.slice(1).split("/");
  return segments.every((segment) => segmentPattern.test(segment)) ? segments.join("/") : null;
}

function contentTypeOf(file: string): string | null {
  const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return contentTypes[extension] ?? null;
}

/**
 * The page's files, served without a sign-in: they are the same for everyone
 * and hold no workspace data, and the page needs them to show its sign-in.
 * Everything a person's workspace holds is behind the API.
 */
export function createStudioPageRoutes(page: StudioPage): StudioPageRoutes {
  return {
    async serve(request) {
      const { pathname } = new URL(request.url);
      const isRead = request.method === "GET" || request.method === "HEAD";
      if (!isRead || isApiPath(pathname)) return null;
      const file = pageFileOf(pathname);
      const contentType = file === null ? null : contentTypeOf(file);
      const bytes = file === null || contentType === null ? null : await page.read(file);
      if (bytes === null || contentType === null) return errorResponse(serverErrors.notFound);
      // A copy, so the body is a plain buffer whatever the host read into.
      return new Response(request.method === "HEAD" ? null : bytes.slice(), {
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(bytes.byteLength),
          "Content-Security-Policy": studioPageCsp,
        },
      });
    },
  };
}
