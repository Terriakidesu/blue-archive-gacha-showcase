# Blue Archive Gacha Showcase

An unofficial Blue Archive gacha animation showcase and asset reference. The site presents reusable entrance and reveal studies with a full ten-card sequence, a focused card, and a synchronized easing curve.

## Live site

- [Animation showcase](https://terriakidesu.github.io/blue-archive-gacha-showcase/)
- [Downloads](https://terriakidesu.github.io/blue-archive-gacha-showcase/downloads.html)

## Development

This is a static site. No build step is required.

```bash
npm install
npm test
npm run format:check
```

Serve the repository root with any static file server, then open `index.html`.

Petite Vue is loaded from a pinned CDN module at runtime.

### Fly-in rendering

`js/fly-in-renderer.js` renders the fly-in cards on a shared WebGL canvas, reusing three card textures. The existing Petite Vue cards still supply the responsive 5×2 layout, accessible image descriptions, and CSS fallback. Reveal and landing effects remain DOM/CSS animations.

The renderer reads the fly-in CSS keyframes and easing, preserves the projected motion, and gives full-sequence and focused playback independent clocks. Only focused playback drives the curve. It redraws while playing or when the viewport changes, respects reduced motion, and falls back to CSS if WebGL is unavailable or its context is lost.

The final **Full ten-pull sequence** study combines all three animations: each card triggers landing effects when it arrives, while later cards are still flying in. The reveal starts when the last card lands; landing effects can finish fading during the reveal. It has one replay control, no focused study, and derives its timing from the individual animation definitions. WebGL hands the settled cards back to the DOM for the portrait reveal.

## Licensing

- **Code:** MIT. See [`LICENSE`](LICENSE).
- **Card SVGs, PNGs, and baked WebP files:** Original recreations made for this project from in-game screenshots, released as Creative Commons–licensed project assets. See [`ASSET-LICENSE.md`](ASSET-LICENSE.md) for the scope and attribution notice.
- **`assets/avatar/`, `assets/portrait/`, and `assets/ba-icons/`:** third-party Blue Archive-related assets. They are not owned by this project and are not covered by the MIT code license.

For the full notice, see [`DISCLAIMER.md`](DISCLAIMER.md). Please verify the source terms and attribution requirements before redistributing any asset.
