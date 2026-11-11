# std.site-name

- Status: active
- Since: 0.1.0
- Source: piece 1 of the [HAL-1708 plan](/HAL/issues/HAL-1708#document-plan), approved by Liam on HAL-1721; Julian's conditions on HAL-1673; P7 on HAL-1782; checklist Part 2.3 of [ux-checklists-sandbox](/HAL/issues/HAL-1833#document-ux-checklists-sandbox)

The std package shall write a host name the way a screen shows a site, as plain text in two parts: `prefix`, the labels before the registrable domain, and `domain`, the registrable domain. The name shall be lowercased and lose a trailing dot. Every character other than `a`–`z`, `0`–`9`, `.`, `-`, `:`, `[` and `]` shall be written as `\u{…}` with its code point in hex. Punycode (`xn--`) labels shall stay as they are. The registrable domain shall come from the package's own pinned copy of the public suffix list, private section included, looked up on the host's ASCII form, with no download at run time; an IPv4 or IPv6 address shall be all domain. When the name is longer than 64 characters (`siteNameMaxLength`), counted after escaping, the prefix shall lose its middle to a `…` so the domain stays whole, or be left out when the domain alone is 64 characters; a domain longer than that by itself shall lose its start to a `…`. A shortened name shall have `cut` set, and an escape shall never be split.

## Examples

- Given `registry.npmjs.org`, when it is shown, then the prefix is `registry.` and the domain `npmjs.org`.
- Given `REGISTRY.npmjs.org.`, when it is shown, then it is the same as `registry.npmjs.org`.
- Given the look-alike `registry.npmjs.org.evil.example`, when it is shown, then the domain is `evil.example`.
- Given `npmjs.org.co.uk`, when it is shown, then the domain is `org.co.uk`, as `co.uk` is a public suffix.
- Given `my.site.github.io`, from the list's private section, when it is shown, then the domain is `site.github.io`.
- Given a name with a Cyrillic `а` in `npmjs`, when it is shown, then that letter reads `\u{430}`.
- Given a name with a right-to-left override or a full-width dot, when it is shown, then it reads `\u{202e}` or `\u{ff0e}`, and the full-width dot doesn't separate labels.
- Given `foo.evil.公司.cn`, when it is shown, then the domain is `evil.\u{516c}\u{53f8}.cn`, as `公司.cn` is a public suffix.
- Given `xn--bcher-kva.example`, when it is shown, then it stays `xn--bcher-kva.example`.
- Given `10.0.0.1` or `2001:db8::1`, when it is shown, then the whole address is the domain.
- Given a name of 200 characters ending in `.evil.example`, when it is shown, then it is 64 characters, `cut` is set, the prefix holds `…` and the domain is `evil.example`.
- Given `api.` and a domain of exactly 64 characters, when it is shown, then the prefix is empty, the domain is whole and `cut` is set.
- Given a domain of 67 characters, when it is shown, then it is 64 characters starting with `…` and ending in `.com`, and `cut` is set.
