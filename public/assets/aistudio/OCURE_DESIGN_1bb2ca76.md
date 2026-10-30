# OCURE_DESIGN.md — visual rules (OCURE screens only)

Scope: routine library, ready state, running session, completion summary, and the widget break card. Do not restyle the dashboard, RETIS, settings, onboarding, or camera screens. Reuse the existing theme token system. Do not add a second theme framework or hardcode hues per component.

## 1. Reference language (adapt, do not copy)
Soft sage surfaces, large rounded cards, a single dark pill as the main action, small tag pills, and clean list rows. Taken from the supplied reference image. Dropped: elements overlapping the card edge, floating callout bubbles, mobile layout, product-store patterns.

## 2. Layout (1440x900 target; verify 1280x720 and 1920x1080)
- Inside the existing app shell: two columns. Left: media stage, about 58% width, 16:9 viewport, 28 px radius. Right: one session panel, 24 px radius, 24 px padding, 16 px gap.
- Panel, top to bottom: routine name (display heading), up to 3 tag pills (duration "2:00", kind), current step title + caption, "Step n of 4" with a 4-segment progress bar, controls.
- One card level only. No cards inside cards. Use spacing and dividers.
- One primary action per state as a full-width pill, 52 px high (Start, Pause/Resume). Stop and Skip are secondary text/outline buttons. The primary pill uses an inverse-of-text token, not a fixed color.
- Tag pills: 28 px high, token tint.
- Library: vertical rows (name, 2:00, one-line description, Start). The suggested routine (if any) is marked. The header shows the real daily line and the 3/4/5 control from OCURE_DAILY_PLAN.md. Insufficient-data and empty states are one calm text row.
- Completion summary: the four steps with real status (finished or skipped), real elapsed time, a Done button. A stopped session states "Stopped early". No scores, streaks or points.
- Under the stage, one anchored caption (step name + remaining seconds). It must be real session state.

## 3. The stage and the clips
- The 10 clips already exist with their own baked-in backdrop. Do not recolor, filter, overlay or sample colors from them. The stage is a neutral framed viewport that looks the same in all four themes; the surrounding UI follows the theme.
- Never stretch: object-fit: cover on a fixed 16:9 viewport; the clips have margin around the mascot.
- No CSS zoom on top of authored framing.

## 4. Per-theme rules
- Minimal Light/Dark: thin borders, restrained sage/teal accent, quiet surfaces, existing display + UI typefaces. No heavy outlines.
- Vivid Light/Dark: bold outlines and the existing shadow treatment on the same layout; stronger active states. Do not flatten into Minimal.
- Dark modes: use the existing dark tokens. Mascot olive/orange may inform the OCURE accent ONLY through the central token system.
- Check AA contrast for captions, tags, controls and the progress bar in all four combinations.

## 5. Accessibility
Captions always visible. aria-live="polite" for step changes. Visible focus rings. All controls keyboard-operable. A text equivalent for every instruction. Respect prefers-reduced-motion (see OCURE_ANIMATION.md).

## 6. Prohibited
Chat bubbles, text input, "Ask AI", sparkles, robot imagery, points, streaks, confetti, glow, decorative gradients, extra blur, fabricated stats.
