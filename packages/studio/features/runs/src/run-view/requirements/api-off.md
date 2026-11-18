# runs.run-view.api-off

- Status: active
- Since: unreleased
- Source: HAL-11595; Liam's decision on HAL-715; Sofia's rows A1 to A5 and A9 on HAL-11945; Mara's words check (HAL-715, microcopy 10.4); the typed cause of HAL-11593 (`events.run-failed-cause`)

When a run failed with the cause code `google.api-disabled` and its `detail.api` names Gmail (`gmail.googleapis.com`) or Google Drive (`drive.googleapis.com`), the run page's banner shall say, in the danger tone, "The Gmail API is off in project *halonic-x*, so this step didn't run." (for Drive "The Google Drive API is off in project …"), with **Switch it on ↗** before **Run again**. The project is `detail.project`; without one the sentence is "The Gmail API is off in your Google project, so this step didn't run." and shows no project name. The banner shall read the run's typed `cause` only, never its `reason` or `error`: a run without that cause, or one whose `detail.api` is not one of the two, keeps the page's ordinary banner.

**Switch it on ↗** shall open `detail.enableUrl` through the host's external open, in the person's browser, and its tooltip and its accessible name shall both say "Opens Google Cloud". It shall be there only when the address is `https`, has no port or login, and its host is exactly `console.cloud.google.com` or `console.developers.google.com` (`googleConsoleAddress`); a missing address, `http:`, or a look-alike host such as `console.cloud.google.com.evil.example` shall hide it and leave **Run again** as the only action. The page shall never build an address from the project.

On a phone the banner shall keep the sentence and, in place of the button, say "Fix this on your computer: switch on the Gmail API in Google Cloud.", with **Run again** as before.

## Examples

- Given a failed run with the cause `{ kind: "denied", code: "google.api-disabled", detail: { api: "gmail.googleapis.com", project: "halonic-x", enableUrl: "https://console.cloud.google.com/apis/library/gmail.googleapis.com" } }`,
  when its page is shown,
  then the banner reads "The Gmail API is off in project halonic-x, so this step didn't run." with **Switch it on ↗** and **Run again**.
- Given a failed run whose reason says "Gmail API has not been used in project" and that has no `cause`,
  when its page is shown,
  then the banner is the ordinary one.
- Given the address `https://console.cloud.google.com.evil.example/x`,
  then `googleConsoleAddress` gives `undefined`.
