# Self-hosted fonts

Both families are variable `woff2` files served from our own origin. No request
leaves the page for a font, and `next build` does not need network access.

| File | Family | Axes | Source |
|---|---|---|---|
| `PlusJakartaSans-Variable.woff2` | Plus Jakarta Sans | `wght 200–800` | [tokotype/PlusJakartaSans](https://github.com/tokotype/PlusJakartaSans) |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | `wght 100–800` | [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono) |

Both are licensed under the **SIL Open Font License 1.1**; the full text is in
`OFL.txt`. The OFL permits bundling and redistribution with software provided
the licence accompanies the font files — it does not require the fonts to be
served from Google.

Coverage: `latin` subset (U+0000–00FF and common punctuation/currency). Adding
`latin-ext` means shipping the second subset and declaring it in
`app/layout.tsx`.
