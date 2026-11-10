# engine.agent-knowledge

- Status: active
- Since: 0.1.0
- Source: HAL-4174, follow-up of HAL-1001; the agent kind's `knowledge` field and the `KnowledgeProviderFactory` port

When the local executor has `knowledge`, the engine shall give a run's agent the knowledge sources its kept file lists in `knowledge`, as the run's kept definitions have them, and a chat turn's agent the sources the host gives for it. The engine shall build each source through the factory whose `type` is the source's `provider`, with the source's id and config and the context the host gives for the source's hub. A listed id the kept definitions don't have shall give no source, and an agent the definitions have no file for, or a chat turn without an agent, shall get none. When no factory builds a source's provider type, the turn shall fail with an error that names the source and the type.

The engine shall offer the model of each such turn `knowledge_search` and `knowledge_read` over the agent's sources, whatever their `mode` (requirement `engine.knowledge-tools`), after Halonic's tools and the agent's memory tools. A run's turn that goes on after a person's OK shall offer them again. An agent without sources shall get neither tool.

## Examples

- Given agent `writer` with `knowledge: [handbook]`, and `handbook` with `provider: files` in the run's kept definitions,
  when the run calls `writer`,
  then the `files` factory builds `handbook` with its config and the hub's context.
- Given a run kept before knowledge joined its definitions,
  when it calls `writer`,
  then no source is built.
- Given `handbook` with `provider: vector` and no `vector` factory,
  when the run calls `writer`,
  then the call fails with `The knowledge source "handbook" uses the provider "vector", which this engine has no factory for.`
- Given agent `writer` with `knowledge: [handbook]`,
  when the run calls `writer`,
  then the model's request offers `knowledge_search` and `knowledge_read`, with `handbook` as the only `source`.
