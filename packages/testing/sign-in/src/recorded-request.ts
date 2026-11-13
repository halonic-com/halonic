/** One request the fake provider received, as it came over the wire. */
export interface RecordedRequest {
  readonly url: URL;
  readonly method: string;
  /** Header names in lower case. */
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  /** The body read as a form, or an empty object when it isn't one. */
  readonly form: Readonly<Record<string, string>>;
}

/** Reads a request the way a server would: the headers, the body as text and the body as a form. */
export async function recordRequest(
  rawUrl: string,
  init: RequestInit = {},
): Promise<RecordedRequest> {
  const body =
    init.body === undefined || init.body === null ? "" : await new Response(init.body).text();
  const headers = Object.fromEntries(new Headers(init.headers));
  const isForm = headers["content-type"]?.startsWith("application/x-www-form-urlencoded") ?? false;
  return {
    url: new URL(rawUrl),
    method: init.method ?? "GET",
    headers,
    body,
    form: isForm ? Object.fromEntries(new URLSearchParams(body)) : {},
  };
}

/**
 * Whether a request carries `value` anywhere: in the URL, a header or the
 * body, as it is, URL-encoded or JSON-escaped. A secret that went where it
 * shouldn't shows up here whichever way it was written.
 */
export function carries(request: RecordedRequest, value: string): boolean {
  const forms = [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)];
  const text = [request.url.href, ...Object.values(request.headers), request.body].join("\n");
  return forms.some((form) => text.includes(form));
}
