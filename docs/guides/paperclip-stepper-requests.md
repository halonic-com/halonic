# Ask for a stepper from a Paperclip task

How an agent in Paperclip asks the person to do something only they can do, such as setting a
secret on GitHub, so it shows up as a stepper in their Halonic Inbox. The request is a task
document; a confirmation card points at its exact revision. Design: architecture note on
HAL-17491, section 7.

## 1. Write the request as the task document `stepper-request`

Save a document with the key `stepper-request` on the task that needs it. Its body is JSON in the
format `halonic.stepper-request/1`, at most 16 KB and at most 20 blocks:

```json
{
  "format": "halonic.stepper-request/1",
  "title": "Set up the deploy for acme/app",
  "reason": "The release job needs a region and a deploy key.",
  "blocks": [
    { "kind": "step", "ref": "github.set-variable@1",
      "parameters": { "owner": "acme", "repo": "app", "name": "REGION" } },
    { "kind": "step", "ref": "github.set-secret@1",
      "parameters": { "owner": "acme", "repo": "app", "name": "DEPLOY_KEY" } },
    { "kind": "browser", "url": "https://github.com/acme/app/settings/variables/actions",
      "instructions": ["Check that REGION is listed."] }
  ]
}
```

- `use` runs a whole reviewed definition, `step` one reviewed step type, `browser` opens a page on
  an allowed GitHub, Cloudflare or other service page and shows your numbered instructions.
- Never put a secret value in the document. A step that takes a secret asks the person for it in a
  native dialog.
- Note the `latestRevisionId` that Paperclip answers with.

## 2. Open a confirmation card pinned to that revision

Create a `request_confirmation` card on the same task. Its `payload.target` points at the
revision you just wrote:

```json
{
  "kind": "request_confirmation",
  "idempotencyKey": "stepper:<task id>:<revision id>",
  "payload": {
    "version": 1,
    "prompt": "The release needs the deploy region and key for acme/app.",
    "detailsMarkdown": "1. Open https://github.com/acme/app/settings/variables/actions ...",
    "target": { "type": "issue_document", "issueId": "<task id>",
                "key": "stepper-request", "revisionId": "<revision id>" }
  }
}
```

- The prompt and details are what the person reads as your reason. Write the details as a manual
  guide: the same steps as numbered instructions, with the page links, so someone without Halonic
  can do them in Paperclip by hand.
- Halonic shows who asked from the card itself (your agent name and the Paperclip connection),
  never from the document.

## What happens next

- **Halonic can read it:** the card becomes a stepper in the Inbox, with what each block touches.
- **Halonic can't read it** (over 16 KB, an unknown step type, a page not on the allow-list, a
  field the format doesn't have): the card stays a normal card and ends with "This card has a
  stepper Halonic can't read: <reason>". Fix the document and open a new card for the new
  revision.
- **You change the document after opening the card:** the stepper says "The request changed after
  this card was made" and doesn't run, and Paperclip expires the card. Open a new card for the new
  revision.

## Reading the result

When the person finishes, Halonic:

1. writes the task document `stepper-result`: the request revision that ran, the outcome, and per
   block its status, time and short result. A secret says only "set on <date>". A step the person
   did themselves says "done by hand";
2. posts one comment on the task that sums it up;
3. accepts the card if the stepper succeeded, and rejects it with the outcome otherwise, so you
   wake either way.

The Paperclip provider reads only the document `stepper-request` and writes only `stepper-result`
on your task. It reads no other document, `plan` included.
