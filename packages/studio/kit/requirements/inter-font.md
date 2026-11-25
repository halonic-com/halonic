# kit.inter-font

- Status: active
- Since: unreleased
- Source: HAL-18694 (the board asked whether the Studio uses Inter; it did only where Inter was installed)

The kit shall ship Inter as the "Inter Variable" family in `@halonicjs/studio-kit/fonts`, which the desktop Studio's CSS imports after the theme: one `@font-face` for upright and one for italic, each covering weights 100 to 900 with `font-display: swap`, and each loading a `.woff2` file in the kit's `src/fonts/` folder by a relative URL, never from the network. The theme (`@halonicjs/studio-kit`) shall not import these faces itself, so the phone's connect page, which imports only the theme, stays within its size limit. `--font-sans` shall name "Inter Variable" first and keep its fallback chain. The fonts' licence (SIL Open Font License 1.1) shall sit next to them as `src/fonts/LICENSE.txt`.

## Examples

- Given a Windows PC without Inter installed,
  when the Studio shows body text,
  then it is drawn in "Inter Variable" from the file the app bundles.
- Given the theme and the fonts built by Tailwind,
  when a test reads its font faces,
  then the italic "Inter Variable" face loads `./fonts/InterVariable-Italic.woff2`, and that file exists.
- Given the phone's connect page,
  when it is built,
  then it holds no Inter font file and draws its text in the fallback fonts.
