# library.listed-tools-review

- Status: active
- Since: 0.1.0
- Source: HAL-850 (proposal, step 6); HAL-2213; Sofia's microcopy 27 (HAL-751) and checklist parts A and C (HAL-2883)

The Library feature shall keep the review of one connector's listed tools: the tools to approve, the tools their server keeps changing, the tools Halonic refused, and the tools that are approved. Nothing shall be ticked at the start. **Approve selected** shall approve only the ticked tools that the search shows. **Approve all** shall approve only the tools to approve that the search shows. Each shall be approved at the version shown, and a tool that has waited at another version since shall not be approved but shall be reported as changed again. A tool its server keeps changing shall be approved only by its own **Turn it on anyway** button. A refused tool shall never be approved. **Approve none** shall close the review, approve nothing and say how many tools stay off.

## Examples

- Given two tools to approve and none ticked,
  when the person asks for **Approve selected**,
  then nothing is approved and the screen says "Tick the tools you want to approve."
- Given three tools to approve and a search that shows one,
  when the person asks for **Approve all**,
  then only the one shown is approved.
- Given a tick on a tool the search hides,
  when the person asks for **Approve selected**,
  then that tool is not approved and its tick is kept.
- Given a ticked tool that changed again while the screen was open,
  when the screen reads the tools again,
  then its tick is cleared and the screen reports it changed again.
- Given a tool its server keeps changing,
  when the person asks for **Approve all**,
  then that tool is not approved.
