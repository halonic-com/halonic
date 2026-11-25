import { ghClickTestRuns, paperclipEvidence } from "../click-test-evidence/clients.ts";
import { postClickTestEvidence } from "../click-test-evidence/post.ts";

/**
 * pnpm exec node tooling/paperclip/src/cli/post-click-test.ts <run id> <task>
 *
 * Posts a studio-preview run's click-test table on a Paperclip task, with its
 * screenshots attached (HAL-18354), for example
 * `… post-click-test.ts 45686461002 HAL-18317`. The agent runs it with its own
 * `gh` and its run's PAPERCLIP_API_URL and PAPERCLIP_API_KEY, so CI never
 * holds a Paperclip credential.
 */

const [runId, task] = process.argv.slice(2);
const apiUrl = process.env["PAPERCLIP_API_URL"];
const apiKey = process.env["PAPERCLIP_API_KEY"];
if (runId === undefined || task === undefined) {
  console.error("usage: post-click-test.ts <run id> <task>");
  process.exitCode = 2;
} else if (apiUrl === undefined || apiKey === undefined) {
  console.error("post-click-test: PAPERCLIP_API_URL and PAPERCLIP_API_KEY must be set");
  process.exitCode = 2;
} else {
  const body = await postClickTestEvidence(
    runId,
    task,
    ghClickTestRuns("halonic-com/halonic"),
    paperclipEvidence(apiUrl, apiKey, process.env["PAPERCLIP_RUN_ID"]),
  );
  console.log(body);
}
