# Valentine Experience — Refined Spec

**Mood:** Cosmic, dreamy, galaxy-like. Starfield particles that orbit, spiral, and explode like a big bang, dyeing the scene pink.

**Core flow:** Press-and-hold → release → choices → final reveal.

---

## Scene 1: Galaxy idle state

- **Background:** Deep space gradient (near-black → deep navy/purple). Optional very faint nebula.
- **Particles:** Many small particles; varying size and brightness. Colors: mostly white/soft blue with occasional pink/purple stars. Motion: slow drift + subtle orbital/spiral around a loose center; none fully static. Optional: parallax (foreground moves slightly faster).
- **Text:** Centered “Press and hold”. Thin sans serif, white or pale lavender. Soft fade-in and very subtle pulsing glow (star-like).

---

## Scene 2: Press-and-hold → cursor-centered heart

- **Interaction:** User presses and holds anywhere (mouse or touch). **Press position = gravity center.** Heart-shaped field is anchored at the **cursor position**, not screen center.
- **While holding:** Particles attracted to heart field at cursor. Attraction radius and force ramp up smoothly over ~1–2 s. Nearby particles respond first; distant ones curve in (orbital paths). Force-based movement; no snapping. Per-particle noise so the heart “breathes” and shimmers.
- **Heart:** Dense cluster of pink/purple particles around cursor. Particle **color shifts toward pink** as they enter the heart field. Optional: subtle glow/bloom; very faint “gravitational lens.”
- **State change:** When heart is clearly recognizable OR after min hold (e.g. 2 s): text → “Release”. Optional: small scale-up/pulse of heart when “ready.”

---

## Scene 3: Release → big bang + pink dye

- **Trigger:** User releases (at any position where the heart has formed).

**Big bang sequence**

1. **Compression (~200–300 ms):** Particles near heart pulled slightly inward toward **cursor point**. Heart briefly brightens (peak pink/white glow).
2. **Explosion:** Sudden outward radial force from **cursor position**. Particles shoot out in all directions with varied speeds and slight spiral/twist. Motion blur/light trails on brighter particles (comet-like).
3. **Scene dyeing:** As explosion expands, background transitions from dark galaxy to soft pink/purple wash. Particles’ base color shifts toward soft pinks. Explosion ring reaches screen edges in ~0.7–1.0 s; background transition completes just after.

**After the big bang**

- **Sparkle:** Subtle twinkle (periodic brightness pulses, short light trails). Restrained; a few “hero” particles.
- **Text formation:** Particles reorganize into: “Will you be my Valentine?” — “cosmic typing” feel (drift into letter shapes from different directions, no snapping). Text readable with micro jitter or glow (letters made of stars).

---

## Scene 4: Choice buttons (cosmic UI)

- **Display:** Three buttons below the text: “Yes”, “No”, “Let it be known across the realm: this Queen says yes.” Minimal rounded rectangles, **semi-transparent dark background, soft pink border.** Hover: slight scale-up and glow (cosmic theme).
- **Yes:** Click → modal “That’s it? Choose again.” → fade back to choices.
- **No:** Not clickable. On hover/tap: button slides to nearby random position (viewport constrained), eased ~300–500 ms, playful.
- **Final option:** Click → fade out text and buttons; particles gently drift apart; transition to final reveal.

---

## Final reveal: soft cosmic Valentine

- **Background:** Lighter pink/purple gradient; faint, slow-moving star particles.
- **Image:** Fades in at center with soft glow. Optional: gentle sparse sparkles around image; soft music starting only after this click (no autoplay before).
- **Interaction:** None required.

---

## Implementation notes

- **Particles:** Force-based (attraction to heart field, radial explosion, per-particle noise). No teleporting; all motion interpolated.
- **Heart field:** Heart in normalized coords; transform to cursor position. Attraction strength and radius parameterized for tuning and performance.
- **Responsiveness:** Cursor position maps to touch on mobile. Particle count configurable; graceful degradation on low-end devices.
