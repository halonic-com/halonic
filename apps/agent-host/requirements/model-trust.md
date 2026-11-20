# agent-host.model-trust

- Status: active
- Since: unreleased
- Source: HAL-13943 (follow-up of the security review of HAL-13134)

When Studio asks the agent host for one chat call on a workspace provider, the agent host shall check the workspace's trust itself on the provider it loaded from the folder, after every other check and right before the call: the test model (`mock`) reaches nothing and needs no trust; any other provider shall be listed, with the same type, address, secret name and settings, in the content of the trust record the user's profile holds for that folder. If there is no record, the record can't be read, the host has no profile folder, or the record doesn't list the provider as loaded, then the agent host shall refuse the request with 403 `workspace_not_trusted` and shall send nothing to the provider. Studio checks trust before it asks; this second check means a provider file saved between that check and the call isn't called.

## Examples

- Given a workspace trusted with its Ollama provider,
  when a provider file is added and Studio asks for a chat call on it,
  then the answer is 403 `workspace_not_trusted` and nothing is sent.
- Given a trusted provider whose file then changes type or address,
  when Studio asks for a chat call on it,
  then the answer is 403; and once the person trusts the new file, the call goes through.
- Given a workspace with no trust record, or one that can't be read,
  when Studio asks for a chat call on a real provider,
  then the answer is 403.
- Given a workspace whose provider is the test model and no trust record,
  when Studio asks for a chat call on it,
  then the answer is the test model's `ChatResponse`.
