# OCURE_DESIGN.md — visual rules (OCURE screens only)

Scope: routine library, ready state, running session, completion summary, and the widget break card. Do not restyle the dashboard, RETIS, settings, onboarding, or camera screens. Reuse the existing theme token system. Do not add a second theme framework or hardcode hues per component.

## 1. Reference language (adapt, do not copy)
Soft sage surfaces, large rounded cards, a single dark pill as the main action, small tag pills, and clean list rows. Taken from the supplied reference image. Dropped: elements overlapping the card edge, floating callout bubbles, mobile layout, product-store patterns.

## 2. Layout (1440x900 target; verified at 1280x720, 1366x768, 1440x900, 1920x1080)
- Inside the existing app shell: two columns. Left: media stage (55% width, 7 cols), responsive 16:9 viewport fitting available height, 28 px radius. Right: one session panel (45% width, 5 cols), 24 px radius, 20-24 px padding, 16 px gap.
- Panel, top to bottom:
  1. Routine recommendation status: clean wrapped status note ("General break · Insufficient observation data to personalize" or "Suggested break") paired with distinct 'Choose another' dropdown button.
  2. Routine identifier ("Routine R1 · 2:00"), display title, and short neutral description.
  3. "Step n of 4" label with a 4-segment progress bar and tabular percentage (`tabular-nums`).
  4. Current step instruction box with skippable step tag if applicable.
  5. Voice status indicator line.
  6. Primary action pill (52 px high) and secondary action buttons (Stop Esc, Skip Step).
- One card level only. No cards inside cards. Use subtle spacing and dividers.
- Recommendation view: the page shows the selected routine with a compact 'Choose another' popover list of all six routines.
- Completion summary: the four steps with real status (finished or skipped) and real elapsed time.
- Under the stage: anchored caption bar displaying step name and remaining countdown seconds.

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

## 7. No scrolling: one-viewport layout
- The OCURE tab fits the visible area below the app header with no vertical page scroll. Stage and panel heights derive from the available height (for example the stage is the largest 16:9 box that fits), not from fixed pixel heights.
- Verify no vertical scroll at 1280x720, 1366x768, 1440x900, 1920x1080. Below a minimum height set as a named constant (suggest 640 px), scrolling is acceptable; content must not be clipped or overlap.
- Diagnose why the page currently opens scrolled before changing layout: check scrollIntoView calls, focus() on mount, preserved scroll position from the previous tab, and content taller than the viewport. Fix the cause. On entering the tab the scroll position is the top.
- Condense the panel: routine name, description, step indicator with progress segments, current instruction, one primary button. The caption under the stage stays one line.
- Remove the sparkle icon next to the ready-state caption. Use a plain status indicator or none. No sparkle, magic-wand or AI-style icons anywhere in OCURE.
