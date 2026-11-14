// The CLI's opener for a plugin's backend (HAL-8089). The opening itself moved
// to the integration runner's package (HAL-9389) so the desktop agent host
// starts a backend the same way; the CLI keeps its requirement and tests here.

export {
  type OpenPluginBackend,
  type OpenPluginBackendRequest,
  openPluginBackend,
  type PluginBackendMachine,
} from "@halonicjs/adapter-integration-runner";
