import type { UploadAndSwitchOptions } from "./upload.ts";

const overrideHeader = "Cloudflare-Workers-Version-Overrides";
/** The longest wait between two tries. */
const longestWaitMs = 10_000;
/** How long one try may take. */
const tryTimeoutMs = 30_000;
/**
 * How long the self-test may take in all. An edge that takes the connection but never answers
 * would otherwise hold a deploy for 16 tries of 30 s each (HAL-13837).
 */
const selfTestDeadlineMs = 150_000;

/** What the self-test reads from the upload's options, with the number of tries settled. */
type SelfTestOptions = Pick<UploadAndSwitchOptions, "fetch" | "sleep" | "onProgress"> & {
  readonly attempts: number;
};

/**
 * Calls `POST /self-test` until it answers, the attempts run out or the deadline passes, and
 * reports each retry so the deploy isn't silent while the address starts answering.
 */
export async function selfTest(
  baseUrl: string,
  worker: string,
  versionId: string | undefined,
  token: string,
  options: SelfTestOptions,
): Promise<{ ok: boolean; failed: string[] }> {
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const { attempts } = options;
  const deadline = Date.now() + selfTestDeadlineMs;
  const request = { url: `${baseUrl}/self-test`, worker, versionId, token };
  let failed: string[] = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const answer = await tryOnce(request, options, Math.min(tryTimeoutMs, deadline - Date.now()));
    if ("ok" in answer) return answer;
    failed = answer.failed;
    const wait = Math.min(2000 * attempt, longestWaitMs);
    // No try that would start at or after the deadline.
    if (attempt === attempts || Date.now() + wait >= deadline) break;
    await sleep(wait);
    options.onProgress?.({ step: "self-test-retry", attempt: attempt + 1, attempts });
  }
  return { ok: false, failed };
}

/** One self-test call: the Worker's report, or why there was none. */
async function tryOnce(
  request: {
    readonly url: string;
    readonly worker: string;
    readonly versionId: string | undefined;
    readonly token: string;
  },
  options: SelfTestOptions,
  timeoutMs: number,
): Promise<{ ok: boolean; failed: string[] } | { failed: string[] }> {
  const doFetch = options.fetch ?? fetch;
  // A timer, not AbortSignal.timeout, so tests can move the clock past it.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await doFetch(request.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.token}`,
        ...(request.versionId
          ? { [overrideHeader]: `${request.worker}="${request.versionId}"` }
          : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) return { failed: [`HTTP ${response.status}`] };
    const report = (await response.json()) as {
      ok?: boolean;
      checks?: { name?: string; ok?: boolean }[];
    };
    const failed = (report.checks ?? []).filter((c) => !c.ok).map((c) => String(c.name));
    // A report that says "not ok" is an answer, not a Worker still starting: don't retry it.
    return { ok: report.ok === true, failed };
  } catch {
    return { failed: ["no answer"] };
  } finally {
    clearTimeout(timer);
  }
}
