# Decision: register the kit's ./app-glyphs entry point

- Approval: Liam reviews this on HAL-18693, where the change is built
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:uw/ec+QIwlMQLMxDvHlmG1v0kKI+SFeHn3fvS9DLl7p8cIaojatXu55Z9oA/n16aB75Al2HmtYSRywgHfqlBDQ==

`@halonicjs/studio-kit` gets a second entry point, `./app-glyphs` (`src/app-logo/app-glyphs.ts`): the apps'
glyph data, with no React and no imports. `apps/studio/src-tauri/icons/draw-app-icons.mjs` draws the
native icons from it under plain Node, so they come from the same glyphs as the kit's `AppLogo`. The kit's
root entry point imports `.tsx` files, which Node can't load, and the layers rule forbids reaching into the
kit by path. This note registers the subpath in `extraExports` of `tooling/check/policy.json`, which is the
only change to that file.

## Covers

- tooling/check/policy.json
