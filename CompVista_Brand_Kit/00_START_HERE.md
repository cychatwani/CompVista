# CompVista — Brand Identity Kit v1.0

Enterprise compensation intelligence. The identity conveys **visibility, structure, trust, and analytical clarity**.

This kit contains **real vector artwork**, not just a picture of a brand board. The production SVG files contain outlines, so the logo's wordmark does not depend on users having a particular font installed.

## Quick start

1. For a light page or white dashboard, use `logos/svg/compvista-primary-dark.svg`.
2. For dark teal backgrounds, use `logos/svg/compvista-primary-light.svg`.
3. For narrow portrait contexts, use `logos/svg/compvista-secondary-stacked-dark.svg` or `...-light.svg`.
4. Use `favicon/favicon.ico` as a browser fallback and the theme-specific SVG favicons for modern browsers.
5. For colors, type and UI styles, import `tokens/compvista-tokens.css` into your frontend.
6. Read `guidelines/CompVista_Brand_Guide.pdf` for presentation and usage examples.

## What's inside

- `logos/svg/`: primary horizontal logo (dark, light/reversed, charcoal monochrome, white monochrome), secondary stacked variants; all outlined vector SVGs with transparent backgrounds.
- `logos/png/`: high-resolution transparent PNG exports, including 1x / 2x primary variants.
- `symbol/svg/` and `symbol/png/`: standalone symbol mark without an app-icon container; color, reversed, charcoal and white.
- `favicon/`: browser favicon in `.ico`, SVG and PNG sizes (16, 32, 48 and 64); light/dark variants and an HTML install example.
- `guidelines/`: four-page, vector-based PDF brand guide with logo system, colors, typography and UI placement examples.
- `tokens/`: CSS and JSON color/type tokens.
- `preview/`: brand-sheet previews and a local HTML logo gallery.
- `sources/`: source SVG with editable wordmark text (requires installed Inter Display or another chosen display font).

## Meaning and construction

The mark combines a geometric **V** with three horizontal perspective/data bands. The solid left form signals stability and a single source of truth; the bands express layers of compensation information becoming visible. It's intentionally a neutral enterprise symbol, without currency signs or literal payroll illustrations.

## Colors

| Role | Hex |
| --- | --- |
| Deep teal — primary | `#0F4C5C` |
| Teal — secondary | `#1E6F7A` |
| Jade — accent / data | `#2F9E8F` |
| Mist — soft surface | `#EEF4F3` |
| Charcoal — primary text | `#172126` |
| Slate — secondary / structural | `#6B7B80` |

Additional white `#FFFFFF` and near-white `#FAFCFB` are used for surface/background contrast.

**Contrast:** Deep teal on white: about 9.5:1, teal on white: about 5.8:1, charcoal on white: about 16.4:1. Jade on white: about 3.3:1 and Slate on white: about 4.4:1, so do **not** use them for small normal-weight body text on white without changing the color or background. Verify WCAG contrast for implementation.

## Typography

- Brand / display: **Inter Display**, semibold/bold. The exported wordmark is converted to vector outlines.
- Product UI: **Inter**, regular to bold, with tabular numerals where supported.
- No font binaries are included in the ZIP. Source fonts are available through the original font distributor. If you edit text in a `sources/*.svg` file, install a matching font first or substitute explicitly.

## Logo usage

- Prefer horizontal logo; don't retype or manually approximate the wordmark.
- Preserve the logo's aspect ratio; do not stretch, shear, rotate or add gradients/drop shadows.
- Reserve clear space around the mark at least equal to half of the symbol's visible height.
- Use dark lockup only on pale backgrounds; use light lockup on deep/dark teal backgrounds.
- Recommended minimum digital width: 160 px for the full horizontal logo and 120 px for stacked; at smaller sizes use the standalone mark only if legible.
- The PDF UI designs are *illustrative mockups*, not finished frontend components.
- No standalone mobile/desktop **app icon** files are included, as requested. Favicon assets are included strictly for browser tabs.

## SVG and tool compatibility

Production logo SVGs use path outlines (portable in browsers, Figma, Illustrator and Inkscape). PNGs are transparent and ready for UI or docs. The editable source SVGs contain text objects. This is a recreated vector implementation of the approved concept rather than a vector extraction of the original generated raster board.

Version: 1.0 · November 2026
