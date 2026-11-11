# studio.licence-notices

- Status: active
- Since: 0.1.0
- Source: HAL-6177 (follow-up of HAL-1708 and #1897; MPL-2.0 section 3.2(a), HAL-6165)

When Vite builds the app's pages and minifies them, the build shall keep the licence comments of the code it bundles (comments marked `@license` or `@preserve`, or opening with `/*!`), such as the MPL-2.0 notice of the public suffix list in `@halonicjs/std`. The Windows installer shall install the repo's `LICENSE` and `NOTICE` next to the app.

## Examples

- Given a module that opens with `/*! @license MPL-2.0 … */`,
  when the Studio page or the connect page is built with the app's Vite config,
  then the built script still holds that comment.
- Given the Windows installer config,
  when it lists the files the installer copies,
  then `LICENSE` and `NOTICE` from the repo root are among them.
