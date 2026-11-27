# paperclip-client.risky-reach

- Status: active
- Since: unreleased
- Source: architecture note HAL-17491, section 6.8 condition 2 (revision 17), decided on HAL-20274; plan on HAL-20278, approved by Liam; task HAL-20441; failing closed for unknown binding types and format characters from the review on HAL-20469, and proposal cards from its second round

The Paperclip provider shall give each of these `risky` items a `reach`, read from Paperclip's own record and never from the question an agent wrote: a `hire_agent` approval names the agent hired (`payload.name`), its adapter (`payload.adapterType`) and the variables of `payload.adapterConfig.env`; an agent's join request names the agent (`agentName`), its adapter (`adapterType`) and the variables of `agentDefaultsPayload.env`; a secret proposal for a binding names the agent that gets the secret (`target.name`), the secret's name and its setting path (`configPath`); a proposal of a new secret names the agent that proposed it and the secret's name; and a confirmation card whose `payload.secretProposal` Paperclip set, whose Accept approves that binding, is `risky` and names the agent that gets the secret (`targetAgentName`), the secret (`sourceSecretLabel`) and its setting path (`configPath`). A person's join request and every other item shall have no `reach`. Of each variable the provider shall read only its name and its binding's `type`, and mark it as binding a secret unless it is a bare string or its type is `plain`, so a binding type Paperclip adds later counts as a secret; it shall never read a binding's `value` or `secretId`, so no value reaches an item, a log or the cache. A name with control characters or runs of white space shall be shown on one line without its format characters and lone surrogates, and one longer than 200 characters shall be cut between code points, ending in "…". The provider shall name at most 100 variables, leave out any whose name doesn't fit the port, and count the ones it left out.

## Examples

- Given a pending `hire_agent` approval for Iris on the adapter `process`, whose `env` binds `ACME_DEPLOY_TOKEN` to a `secret_ref` and sets `ACME_REGION` to a plain value,
  when the inbox is read,
  then its `reach` names the agent Iris, the adapter `process`, `ACME_DEPLOY_TOKEN` as binding a secret and `ACME_REGION` as not, and holds neither the plain value nor the secret's ID.
- Given Cy's join request as an agent on the adapter `process`, whose defaults set `ACME_TOKEN`,
  when the inbox is read,
  then its `reach` names the agent Cy, the adapter `process` and `ACME_TOKEN`, and a person's join request has no `reach`.
- Given Ada's proposal to give Bo the secret "Acme deploy token" at `env.ACME_DEPLOY_TOKEN`,
  when the inbox is read,
  then its `reach` names the agent Bo, the secret "Acme deploy token" and the setting path `env.ACME_DEPLOY_TOKEN`.
- Given a `hire_agent` approval whose `env` sets 120 variables,
  when the inbox is read,
  then its `reach` names 100 of them and counts 20 left out.
- Given a `hire_agent` approval whose `env` binds `ACME_VAULT` with a type Paperclip may add later, `vault_ref`,
  when the inbox is read,
  then its `reach` names `ACME_VAULT` as binding a secret.
- Given a confirmation card whose `payload.secretProposal` gives Bo "Acme deploy token" at `env.ACME_DEPLOY_TOKEN`,
  when the inbox is read,
  then it is `risky`, its `reach` names the agent Bo, the secret and the setting path, and only its Reject declines.
