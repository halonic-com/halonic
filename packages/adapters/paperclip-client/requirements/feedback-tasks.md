# paperclip-client.feedback-tasks

- Status: active
- Since: unreleased
- Source: HAL-18737 (screenshot feedback, parent HAL-18563, board's go-ahead on HAL-10); rows agreed on HAL-18740

When Studio sends screenshot feedback, the Paperclip provider shall create one task with
`POST /api/companies/{company}/issues` whose body is exactly `title`, `description`, `projectId`,
`assigneeAgentId`, `status: "todo"` and `idempotencyKey`, the key made from the feedback's own ID, so
sending the same feedback again gets the task Paperclip already made. It shall find the project and
the agent by name with the company's project and agent lists, and refuse, sending no task, when
either has no match. When the feedback has a screenshot, the provider shall read the task's
attachments with `GET /api/issues/{task}/attachments` and, when no file of the screenshot's name is
there, upload it with `POST /api/companies/{company}/issues/{task}/attachments` as one multipart
`file` part. That row shall take only a PNG (checked by its first bytes) of at most 10 MB with a
plain file name ending `.png`, and no JSON body; every other row shall take no file. The provider
shall answer `sent` with the task's ID and its page, `offline` when Paperclip can't be reached,
`not-connected` when the key is refused, or `refused` with a reason.

## Examples

- Given Acme's projects and agents,
  when feedback for project "Website" and agent "Ada" is sent with ID `f1`,
  then the task body names the Website project, Ada, status `todo` and key `halonic-feedback:f1`.
- Given a feedback with a screenshot,
  when it is sent,
  then the upload is one `file` part holding the PNG's bytes, of type `image/png`.
- Given the reply to the first send was lost,
  when the same feedback is sent again,
  then the same key goes out, Paperclip answers with the same task, and the PNG is not uploaded again.
- Given a file that isn't a PNG, or a JSON body on the upload row,
  when it reaches the transport,
  then it is refused and nothing goes out.
