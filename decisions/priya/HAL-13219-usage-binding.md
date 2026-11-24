# Decision: the usage object checks its name and waits after an empty pull

- Approval: Liam asked for this note in the review of the pull request (HAL-17577)
- Kind: internal

The requirement cloudflare-durable.usage-object gains three things, and nothing it already said is weakened: a call for a scope other than the name the Worker gave the object is refused; a pull that fails is refused with `plan.none`, like a pull that found no limits; and after a pull that found no limits the object waits 30 seconds before asking Cloud again. One example and one rationale clause come with them. The requirement is not released yet (`Since: unreleased`).

## Covers

- cloudflare-durable.usage-object
