/** A fetch that takes the URL as a string, such as the host's `ctx.http.fetch`. */
type StringFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Wraps a fetch so `init.signal` still ends the call. The host's
 * `ctx.http.fetch` forwards only the method, headers and body, so without
 * this a timeout such as `AbortSignal.timeout(8_000)` never fires (Julian's
 * security review of HAL-19136). The call is not cancelled on the host's side;
 * its answer, if one comes, is ignored.
 *
 * Rejects with the signal's reason, so a timeout still reads as a
 * `TimeoutError` to the caller.
 */
export function fetchHonouringSignal(fetchUrl: StringFetch): typeof fetch {
  return (url, init) => {
    const signal = init?.signal ?? undefined;
    const call = fetchUrl(String(url), init);
    if (signal === undefined) {
      return call;
    }
    if (signal.aborted) {
      return Promise.reject(signal.reason);
    }
    return new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      call.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
    });
  };
}
