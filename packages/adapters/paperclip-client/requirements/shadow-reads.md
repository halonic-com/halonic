# paperclip-client.shadow-reads

- Status: active
- Since: unreleased
- Source: HAL-19462 (shadow-mode build plan, PR 3), HAL-19417 (threat model rev 2, G1 and G2), HAL-19796

When the auto approvals shadow runner reads Paperclip, the Paperclip provider shall send only GET requests on its short shadow list: pending approvals, one approval with its activity, comments and linked issues, and the never-list and `auto-approve-stop` documents of the pinned issue with their revisions. The shadow reader shall have its own transport, and shall refuse any other method or request before anything is sent, and count it. The shadow reader shall fail closed, with an error, on a redirect, any answer other than 200, an answer for another company, a revision of another document or an answer over 1 MB. No row on the fixed request list shall write, lock, unlock or delete the never-list or the stop document.

## Examples

- Given the shadow reader is made to send the `approve` row,
  then it throws, Paperclip hears nothing and the refused count is 1.
- Given Paperclip answers the never-list read with 204,
  then the read fails and no document is given.
- Given the never-list document's `companyId` is another company's,
  then the read fails and no document is given.
