# Moiré Generator

Moiré Generator draws moiré from closed-form gratings. Every pixel is evaluated from the grating equations. Layers are stacked by multiplying their transmission, the way physical films stack on a light table, and the fringe you see is the beat between those gratings.

The picture loops. WebM and MP4 record that loop at a real frame rate. GIF, PNG, and a JSON project file are there too. Fullscreen projection is built in.

## Run it

You need Node.js 20.19 or newer, or Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). The dev server listens on every interface, so another machine on the same network can open `http://<this-machine>:5173/`. The port is 5173.

A static build:

```sh
npm run build
npm run preview
```

`npm run build` typechecks, then writes `dist/`. Paths in that build are relative, so the folder can be hosted from a subdirectory.

The browser needs WebGL 2. Video export also needs [WebCodecs](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API), which current Chrome, Edge, Brave, and other Chromium browsers provide.

The page keeps the current project in `localStorage` under this origin. A preset in the address bar starts clean and does not write that save. For example, [http://127.0.0.1:5173/?preset=pitch](http://127.0.0.1:5173/?preset=pitch). Add `&pause=1` to open on the first frame.

## The stage

The short side of the frame is one unit. The origin is the center. Y points up. An angle of 0° means the phase of a line grating changes along +x, so the lines are vertical.

Drag a crosshair to move that layer’s center. The hit target is the selected layer when the pointer misses every crosshair. The wheel changes frequency. Shift-wheel rotates by half a degree. Alt-wheel changes duty (the dark fraction, or the dot radius).

The beat of the selected pair is written under the formula when the pair is two line gratings, two spoke fields, two zone plates, or two ring gratings. It reports the difference frequency and its direction. For equal zone plates the beat is `8 Z |Δc|` cycles per unit, where `Z` is zones to the edge and `Δc` is the distance between centers.

## Layers

Add a layer from the **Add** menu. There can be up to 12. One layer always remains. The dot on a row enables that layer. The arrows change stack order. **Duplicate** and **Remove** are on the selected layer.

| Type | What it is |
| --- | --- |
| Lines | Straight grating. Phase is `f (x cos α + y sin α) + φ₀`. |
| Spokes | Integer number of arms around the center, so the seam closes. |
| Rings | Phase depends on radius. |
| Zone plate | Phase is `Z (r / ½)²`. `Z` is the number of cycles out to the edge of the short side. |
| Spiral | Archimedean spiral: arm count plus radial cycles. |
| Log spiral | Logarithmic spiral: arm count plus `f ln r`. |
| Dots | Circular dots on a square lattice. Frequency is cells per unit. |
| Hex dots | Circular dots on a hexagonal lattice. |
| Grid | Two rulings on one screen, horizontal and vertical in the layer’s own frame. The layer’s transmission is their product. |
| Checker | Two square gratings combined as `A + B − 2AB`, so neighboring cells have opposite transmission. |

**Sinusoid** is `½ + ½ cos(2πφ)`. **Ruling** is a dark bar of the given dark fraction, built from a Lanczos-windowed Fourier series. Harmonics run from 1 to 24. On dots and hex dots the same choice is **Soft** or **Hard**: a cosine lobe, or a disk whose edge is analytically antialiased.

**Gel** dyes the absorber. Gel amount 0 is a neutral density. Clear gaps stay clear, so stacked cyan, magenta, and yellow stay luminous. Opacity fades the layer out of the stack.

**Phase cycles**, **rotation cycles**, and **orbit cycles** are revolutions over one loop. The small hertz readout is `cycles × motion / loop seconds`. Warp bends the grating sideways by a sine of the cross coordinate. Y scale stretches the layer before it is drawn. Orbit radius walks the center around a circle.

Changing the type keeps the settings that still apply.

## Motion and a closed loop

Three clocks sit in the footer:

- **Loop** is the length of one cycle, from 0.5 to 120 seconds. Export uses this length.
- **Playback** is how fast the preview walks through that cycle. It does not change the pictures inside the loop.
- **Motion ×** multiplies every cycle count: phase, rotation, orbit, scale pulse, and field rotation.

The header says **Loop closes** when `motion` times each of those cycle counts is an integer. A fractional product means the last frame does not meet the first. **Snap to loop** rounds those products back onto whole turns.

**0** resets the phase to the start of the loop. The scrubber sets the phase directly, from 0 to 1.

## Stack

**Combine** is how the enabled layers become one picture.

| Mode | Meaning |
| --- | --- |
| Transmission | Physical stack. The frame is the product of the films. |
| Cross term | The interference term only: `½ + ½ ∏ (2T − 1)`. The sum frequencies drop out and the beat remains. |
| Difference | Absolute difference of successive patterns. |
| Add | Opacity-weighted mean. |
| Screen | `1 − ∏ (1 − T)`. Light from a stack of emitters. |
| Min | Darkest transmission at each pixel. |
| Max | Brightest pattern at each pixel. |

A layer that is off is skipped. With nothing enabled, the frame is white.

Below that, the grade runs in this order: exposure, saturation around Rec.709 luma, vignette, iris, contrast around middle gray, gamma, invert, then a soft threshold. Threshold 0 is off.

## Optics

**Vignette** darkens the corners. **Iris** is a circular matte; 0 is off. **Chromatic** evaluates the stack three times, with the field scaled by `1 ± chroma` for red and blue. 0 skips the extra passes.

**Samples** is the integral of the product. Each pixel averages an N×N grid inside the pixel, from 1×1 to 4×4. The default is 2×2. This is the pixel’s integral of the multiplied gratings. Band-limiting each grating before the multiply would erase beats that are still coarse enough to see.

## Field

**Scale** zooms the whole field. Values above 1 zoom in. **Scale pulse** breathes that zoom, and **pulse cycles** is how many breaths fall inside one loop.

**Rotation** and **rotation cycles** turn the field. **Kaleidoscope** 0 is off; 2 or more is the number of mirrored sectors. **Tile** 0 is off; 2 or more repeats the field that many times across the unit square.

## Presets

The preset menu replaces the project. **Current** leaves it alone.

| Preset | What you are looking at |
| --- | --- |
| Angle | Two 40-cycle rulings, 3.2° apart. One of them travels one cycle per loop. |
| Pitch | 36 against 40, both vertical. The beat is exactly 4 cycles per unit along x. |
| Bend | A straight ruling against a warped one. |
| Spokes | 42 arms against 48, one center nudged by 0.012, one field turning once per loop. |
| Zones | Two zone plates of 24 cycles, centers at ±0.01. The linear beat is 3.84 per unit. |
| Spirals | Two Archimedean spirals, 7 arms, radial pitches 14 and 15, turning opposite ways. |
| Rings | 40 against 46, centers 0.02 apart. The radial beat is 6. |
| Halftone | Cyan, magenta, and yellow dot screens at 15°, 75°, and 0°, plus a neutral black screen at 45° and a slightly different pitch. |
| Tricolor | Red, green, and blue line gels at 0°, 60°, and 120°. |
| Projection | Fine rulings, ±1.5°, a vignette, and a grade aimed at a throw. |

## Projection

**Project**, or the **F** key, hides the panels and asks the browser for fullscreen. The pointer disappears after a moment of stillness. **Exit projection** or **F** again leaves it. **H** hides the panels without entering fullscreen, which is the useful path for a screenshot or a windowed throw.

## Export

Set the width and height from 16 to 3840. **1080²**, **1920×1080**, and **1080×1920** fill those fields. The export size is remembered in the browser.

| Button | File |
| --- | --- |
| WebM | The loop, encoded in the browser. Codecs are tried in this order: VP9, AV1, VP8. |
| MP4 | The same loop. Codecs are tried in this order: H.264, AV1, HEVC. The file is written with the index at the front so it can start playing before it is fully read. |
| PNG | The frame on screen now. |
| GIF | The loop, paletted. A neutral picture uses a fixed 256-gray palette. A colored picture is quantized to 256 colors from samples across the loop. |

**Video fps** runs from 1 to 120 and defaults to 60. The encoder writes `round(fps × loop seconds)` frames, at least 2. Frame `i` is phase `i / N`, and each frame is held for `loop / N` seconds, so the file lasts exactly one loop and the next repeat meets the first frame. A 6 second loop at 60 fps is 360 frames.

Odd widths and heights are rounded down to an even size inside the video file, because those codecs require it. PNG and GIF keep the size in the fields.

**GIF frames** runs from 2 to 4000 and defaults to 48. A GIF stores delay in hundredths of a second, and the shortest step a browser will honor is 2 hundredths, so a GIF tops out around 50 pictures a second. For a smooth loop, use WebM or MP4.

While a file is encoding, the export buttons are disabled and the status line counts frames. When the header says the loop closes, the status after a save says the phase returns to the first frame.

## Projects

**Save** downloads a JSON file:

```json
{ "kind": "moire", "version": 1, "project": { } }
```

**Load** reads that file, and so does dropping a JSON file on the window. The project inside is checked and clamped back into range. Undo keeps the previous project.

Undo is Ctrl+Z or Cmd+Z. Redo is Ctrl+Shift+Z, Cmd+Shift+Z, or Ctrl+Y. The stack holds 60 steps. Typing in a field does not undo the picture.

## Keys

| Key | Action |
| --- | --- |
| Space | Play or pause. |
| F | Enter or leave projection. |
| H | Hide or show the panels. |
| `[` and `]` | Select the previous or next layer. |
| 0 | Return to the start of the loop. |
| Esc | Leave a text field. |

## What the picture is doing

A line grating of frequency `f` at angle `α` has wavevector `k = f (cos α, sin α)`. Two of them beat at `|k₁ − k₂|`. Matched pitches and a small angle make a coarse fringe almost perpendicular to the lines. Different pitches at the same angle make a beat along the lines. The same difference-frequency idea is what the spokes, rings, and zone-plate readouts are measuring.

The shader and the TypeScript series use the same formulas. A built-in check compares them on a grid of pixels.
