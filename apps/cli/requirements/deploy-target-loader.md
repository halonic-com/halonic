# cli.deploy-target-loader

- Status: active
- Since: unreleased
- Source: HAL-6702; ADR 5.6 on HAL-35 and the build plan on HAL-6702, approved by Liam on HAL-13512; HAL-7114 (the CLI never imports a deploy target)

When `halonic deploy` needs the deploy target for a deployment's `host`, the CLI shall load the package `@halonicjs/target-<host>-deploy` by that computed name, without listing or importing it anywhere, and shall use its `deployTarget` export only if it serves that host, was built for the deploy-target port version this CLI uses, and gives a target with every method of the port. If the host name isn't lowercase letters and digits with single hyphens, it shall stop with exit 2 before importing anything, and say which host names work. If the package isn't installed, it shall stop with exit 4, name the package and how to install it, and say that nothing changed on the host. If the package is installed but unusable, it shall stop with exit 1 and say why. If the package is installed but something it imports is missing, the CLI shall keep that error rather than say the package isn't installed.

## Examples

- Given a deployment with `host: cloudflare` and `@halonicjs/target-cloudflare-deploy` installed,
  when the target is loaded,
  then the CLI gets the target that package's `deployTarget` creates.
- Given `@halonicjs/target-cloudflare-deploy` not installed,
  when the target is loaded,
  then it stops with exit 4: "Deploying to Cloudflare needs the package @halonicjs/target-cloudflare-deploy, and it isn't installed. Nothing changed on Cloudflare." and the fix "Install it next to halonic with npm install -g @halonicjs/target-cloudflare-deploy, then run again.".
- Given an installed target package built for another port version,
  when the target is loaded,
  then it stops with exit 1, names Halonic's version and both port versions: "The installed @halonicjs/target-cloudflare-deploy doesn't work with Halonic 0.1.0: it was built for deploy targets version 2, not 1."
- Given a deployment whose `host` isn't lowercase letters and digits with single hyphens, such as `../x`,
  when the target is loaded,
  then it stops with exit 2 before importing anything: "\"../x\" isn't a deploy host." and the fix "Set host in deployments.yaml to cloudflare, then run again.".
