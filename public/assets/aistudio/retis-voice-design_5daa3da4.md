# RETIS Voice Mode: Visual and Animation Specification

Implement together with `retis-voice-function.md`. This file defines what the Voice mode screen looks like and how it animates. The function file defines how it works. If they conflict, the function file wins on behavior and data, and this file wins on layout and animation.

Supersedes all earlier Voice mode visual instructions (video overlay, plain circle orb, earlier caption specs).

---

## 1. Reference images

Two images may be attached:
- `reference-orb`: a blue ChatGPT-style voice orb. Use it for the orb look only: a sphere with flowing blue and light-blue shapes and soft white highlights moving inside it. Do not copy its branding, window chrome, laptop mockup, background rings or controls.
- `current-state`: a screenshot of the current build, showing a flat solid-blue circle with the label "Listening". This is the defect to fix. Do not reproduce it.

Reference images are visual direction only. Where an image and this file disagree, this file wins.

## 2. Scope

Voice mode screen only (the orb screen opened from the composer voice button). Do not change the response schema, RETIS_SYSTEM_INSTRUCTION, validation, metric formulas, blink detection, camera, tracking, the chat layout, history, the theme system or other routes.

## 3. Screen layout

An overlay filling the RETIS container below the top navigation. It is not a route. The page never scrolls.

Centered column on the shared chat-column width, top to bottom:
1. Header row: "RETIS VOICE" label (left), "Captions" toggle (right).
2. Orb.
3. Status line, one line, secondary colour, `aria-live="polite"`.
4. Caption block, fixed reserved height of about 4 lines, so nothing jumps.
5. Metric chips row (reserved space, appears after a reply that used metrics).
6. Controls row: microphone (mute toggle, 56px), keyboard icon button (closes Voice mode and focuses the chat composer, 44px), close (44px). 16px gaps, icon-only, with aria-labels.

Sizes: orb `clamp(160px, 28vh, 260px)`. Below 700px viewport height, 140px. Below 560px, 120px. Must fit with no page scroll at 1440x900, 1366x768, 1350x620 and 1280x600, and at 110% and 125% zoom.

The crossed-out microphone appears only when the user has muted, or when the microphone is blocked or unavailable. Never for an internal restart or pause.

## 4. The orb (graphical, layered)

The orb is not a flat circle. It is a layered graphic sphere. Build it with inline SVG and CSS only. No image or video files. No canvas or WebGL unless CSS and SVG cannot meet the frame rate (then report why).

### 4.1 Structure (inside a circular clip)
1. Base: radial gradient from light sky blue near the top-left to deeper blue at the bottom-right.
2. Four to five blob shapes (organic closed paths or ellipses), each with its own soft linear or radial gradient in blue, cyan and light-blue tints, blurred at most 20px. They overlap and move independently.
3. White flowing highlight layer: two or three wave-like or crescent shapes in soft white (opacity 0.55 to 0.9) that sweep across the orb, producing the swirling cloud-and-water look of the reference.
4. Inner shading: a radial gradient from transparent to a slightly darker edge for spherical depth, plus a small soft specular highlight near the top-left. Gradients only. No glow outside the circle.

The orb must show visible internal shapes in every state and every theme. A single flat colour is a defect.

### 4.2 State palettes
Define once as tokens for all four theme combinations. Same structure, different gradients.

| State | Palette | Motion |
|---|---|---|
| Idle / muted | desaturated version of the listening palette | very slow breathing, scale 1.0 to 1.02 over about 4s, slow blob drift |
| Listening (user speaking) | blue family: sky blue, cobalt, white highlights (matches the reference) | drift speed and orb scale (1.0 to 1.08) follow the real microphone level |
| Thinking | lower-saturation slate-blue and indigo | slow steady swirl (about one rotation per 6s) with a soft opacity pulse (about 1.6s) |
| Speaking | violet-tinted blue: violet, lavender, white highlights | faster flowing swirl, scale follows the real output level when available, else a steady rhythm |
| Interrupted | listening palette | returns within one frame, 120ms scale settle |

Colours differ in hue, not only brightness, and state is also shown by the status line, so colour is never the only signal. The Color Studio accent must not change these state palettes. The orb edge must stay clearly distinct from the page background in Minimal Light, Minimal Dark, Vivid Light and Vivid Dark.

### 4.3 Motion rules
- Animate transform and opacity only. No animated filters or blur values.
- Each blob and highlight has its own keyframe loop (translate, rotate, scale), with durations from 6s to 14s and different easing, so the motion never reads as one rotating disc.
- Palette changes crossfade over 240ms using stacked layers (opacity only). Scale and speed changes ease over 260ms with the existing `cubic-bezier(0.22, 1, 0.36, 1)`.
- Level reactivity uses real audio levels only (microphone analyser when listening, decoded TTS audio analyser when speaking), smoothed with about 80ms attack and 200ms release. The browser speech voice exposes no level: use a steady speaking rhythm and never a simulated level.
- Open: scale 0.92 to 1 with a fade (420ms). Close: reverse in 200ms.
- Use `will-change: transform` on the animated layers only. Pause all orb animation when the window is hidden. Target 60fps with webcam monitoring running. Report CPU and frame time, or state they were not measured.

### 4.4 Reduced motion
Under `prefers-reduced-motion`, show the full static graphic (layered gradients and highlights frozen in the state palette), with no movement and instant colour changes. Never a solid fill. Check whether the current flat look comes from a reduced-motion fallback (Windows "show animations" off) or from blob layers with no size, and report the cause.

### 4.5 Style treatment
- Vivid: bold outline ring and a hard offset shadow around the orb.
- Minimal: fine ring and a soft shadow using the existing blur token.
- No glows, particles, sparkles, extra rings or text inside the orb.

## 5. Captions below the orb

- On by default. The toggle stays, is clearly labelled "Captions", and its persisted value is respected.
- The user speaking: live transcript, smaller secondary style (about 70% of the response size), newest words at full opacity. It appears within 300ms of each interim result. When the utterance is sent it fades (180ms). During thinking, the user's last sentence stays dimmed until the first reply words appear.
- RETIS speaking: large type, `clamp(22px, 2.4vh + 12px, 32px)`, line-height 1.4, centered, max width about 760px, interface font, token colours. Spoken words at full opacity, upcoming words at 35% opacity, the active word on a subtle accent-coloured pill. Transitions are 140ms and affect opacity and background only.
- Timing: use word-boundary events when available. For Gemini TTS, estimate from the decoded audio duration, distributed by character count per word, and re-sync at sentence boundaries. If speech is muted, unsupported or failed, reveal the words at about 3.5 words per second. The full reply is always shown, even if audio fails.
- Windowing: at most 3 lines visible. When a new line starts, the older line fades up and out (translateY -8px, opacity to 0, 260ms) under a gradient mask at the top edge. No scrollbar.
- After the reply ends, hold for 4 seconds (named constant, minimum 2 seconds for very short replies), then fade out (260ms) if the user is silent. If the user starts speaking, fade immediately.
- Metric chips: after the last word, chips from `metrics_used` fade in staggered (60ms steps) in reserved space, with the footer "Based on: <period> · <observed time>". Add "AI-generated summary" only for model replies, never for local fast-path replies. Values come from the snapshot built at send time.
- Interruption: the caption stops advancing, unspoken words stay at 35% for 300ms, then fade while the user's live transcript fades in. The interrupted reply stays in history with its interrupted flag.
- Unavailable measurements are shown as a normal short sentence. No error styling and no raw error codes.

## 6. Theming

Use the existing tokens for Minimal Light, Minimal Dark, Vivid Light and Vivid Dark. Minimal stays neutral, so the orb is the only coloured element. Vivid keeps bold outlines and hard shadows around the orb and controls. The Color Studio accent applies only to the active-word pill, focus rings and the active microphone ring.

## 7. Accessibility

- Every control is keyboard-operable with a visible focus ring. Space toggles mute when focus is not in a text field. Esc closes.
- The status line announces state changes. The caption block is an `aria-live="polite"` region that announces the final reply once, not every word highlight.
- Caption text contrast against the actual background is at least 4.5:1 in all four combinations. The highlight pill and UI boundaries are at least 3:1.
- Reduced motion: no line-fade or highlight animation, and words change state instantly.

## 8. Prohibited

Generic AI visual clichés: sparkle icons, particles, glowing rings, extra decorative gradients, text inside the orb, video or image assets for the orb, copied branding or window chrome. Every animation reports a real state or a real signal.

**Product-quality constraint:** Implement this as a deliberate, production-minded change to the existing IRIS AI application. Do not introduce generic AI-themed interface elements, AI-generated visual clichés, unnecessary gradients or glow effects, excessive glassmorphism, decorative cards, meaningless animations, fabricated data, or unrequested features. Preserve the established IRIS design system and existing application architecture. Prioritize functional correctness, visual consistency, maintainable code, accessibility, and verifiable behavior. Do not redesign unrelated areas.

## 9. Acceptance criteria

- The orb is a layered graphic sphere in every state and all four theme combinations, including the reduced-motion static version.
- State palettes crossfade with no flicker, change within one frame of the real state, and the orb edge is distinct from the page in all four combinations.
- The listening orb reacts to the real microphone level. No simulated level is ever shown.
- Captions appear below the orb, live for the user and word-highlighted for RETIS, with a fixed height and no layout shift. The full reply is visible even if audio fails.
- No page scroll at the four tested sizes. Contrast is measured. 60fps is measured or labelled not run.

## 10. Delivery report

Provide screenshots at about 1440x900 and 1350x620 of idle, listening with live transcript, thinking, speaking with highlighted captions, finished reply with chips, interrupted and muted states, in all four theme combinations, plus the reduced-motion orb. Include mid-transition frames, or state they were not captured. Report why the orb looked flat, the exact files changed, CPU and frame time, checks run, checks not run and remaining limitations. Do not claim anything passed that was not executed. The working application code must change.
