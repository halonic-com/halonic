import type { HttpClient } from "@halonicjs/ports";

/** One request the fake provider received. */
export interface Received {
  readonly url: string;
  readonly init: RequestInit;
}

/** A fake `HttpClient` that records its requests and answers with `answer`, which may throw. */
export function fakeProvider(
  answer: () => Response,
): HttpClient & { readonly received: Received[] } {
  const received: Received[] = [];
  return {
    received,
    async fetch(url: string, init: RequestInit = {}): Promise<Response> {
      received.push({ url, init });
      return answer();
    },
  };
}

/** The form a recorded request sent, parsed (the core's types have no `URLSearchParams` value). */
export function sentForm(request: Received | undefined): Record<string, string> {
  const body = String(request?.init.body ?? "");
  const decode = (text: string) => decodeURIComponent(text.replaceAll("+", " "));
  return Object.fromEntries(
    body === ""
      ? []
      : body.split("&").map((pair) => {
          const [name = "", value = ""] = pair.split("=");
          return [decode(name), decode(value)];
        }),
  );
}

/** The headers a recorded request sent: the token request writes them as a plain object with lower-case names. */
export function sentHeaders(request: Received | undefined): Record<string, string> {
  return { ...(request?.init.headers as Record<string, string> | undefined) };
}
