# RETIS Screen: Layout and Design Specification

Scope: the RETIS screen only ("Retis Analyst" route). This file defines layout, structure, sizing, states and theming. It supersedes earlier RETIS layout instructions where they conflict. It does not change data logic, Gemini behavior, metric formulas or other screens.

Source-of-truth order: the actual repository and runtime behavior, then this file, then reference images. Inspect the project before editing. Do not invent file names, components or dependencies. Reuse the existing token system, the existing RETIS mascot asset (unmodified), the existing snapshot builder and the existing Gemini integration.

---

## 1. Layout concept

A single-viewport, centered chat layout. The reference is a minimal chat landing screen: a slim top bar, one large heading, one large rounded composer, and a lot of empty space.

- The page never scrolls. Only the message thread scrolls, inside its own container.
- Home state shows exactly: mascot + greeting, composer, one chip row, one slim snapshot bar. Nothing else.
- Everything the earlier version showed (metric cards, action cards, prompt chips, connection badge, recalibrate) remains available. It is relocated, not removed.

Reference usage: structure, proportions and whitespace only. Do not copy its brand, logo, gradient heading text, diagonal outline shapes, corner glow, or "Login" button.

## 2. Home state (no messages)

```
+--------------------------------------------------------------+
| [app shell top navigation, unchanged]                        |
|                                                              |
|                                                              |
|                       [ RETIS mascot ]                       |
|                    Hello, <first name>                       |
|          Monitoring status line (real state)   [badge]       |
|                                                              |
|     +--------------------------------------------------+     |
|     |  Ask RETIS about your blink rate, distance...    |     |
|     |                                                  |     |
|     |  [Report PDF] [Heat map] [Trends]          [Send]|     |
|     +--------------------------------------------------+     |
|        [Blink Rate] [Screen Distance] [Breaks] [Alerts] ...  |
|                                                              |
|                                                              |
|  Snapshot: 29 BPM | 46 cm | Alerts 10 / 31 | ...  (period)   |
+--------------------------------------------------------------+
```

### 2.1 Vertical rhythm
- Content column is centered horizontally and vertically in the space below the top navigation, optically placed slightly above true center (about 45% from the top of the available area).
- Column width: `min(100% - 48px, 820px)`.
- Gaps: mascot to heading 12px, heading to status line 8px, status line to composer 28px, composer to chip row 14px. Use `clamp()` so these shrink on short viewports.

### 2.2 Greeting block
- Mascot: existing RETIS asset, `clamp(64px, 11vh, 104px)`, centered, unmodified. If the asset has an opaque background that clashes with a theme, place it on a neutral rounded plate. Do not edit the image.
- Heading: "Hello, <first name>" in the existing display font of the active style. The name uses the existing italic-serif accent treatment. Size `clamp(36px, 6vh, 60px)`, weight and tracking per the current style's heading rules. Solid text color from tokens. No gradient text.
- Status line: one line, real monitoring state (running, paused, camera unavailable) plus the data period. Secondary text color, 14px.
- Connection badge: small pill beside or under the status line. It reflects the real Gemini state only: not configured, connected (recent successful request), offline, error.
- The "Recalibrate Distance" action moves into the top-right of the RETIS container as a compact secondary button. Its behavior is unchanged.

### 2.3 Composer (primary element)
- Large rounded card, full column width. Corner radius from the style's large-radius token (about 24px). Minimum height `clamp(104px, 16vh, 148px)`.
- Multi-line auto-growing textarea, 1 to 6 lines then internal scroll. Placeholder: "Ask RETIS about your blink rate, screen distance, alerts, or breaks...".
- Footer row inside the card:
  - Left: three compact action buttons, icon plus short label: "Report (PDF)", "Heat map", "Trends". Subtitle text (period, what is plotted) is the accessible description and shows on hover or focus. Behavior is unchanged, including disabled-with-reason states.
  - Right: send button. Enter sends, Shift+Enter inserts a newline. Send is disabled when the input is empty or a request is pending. While pending, it becomes a cancel button.
- The disclaimer line sits directly under the card, one line, 12px, secondary color: "IRIS provides screen-awareness suggestions and does not diagnose, treat, or prevent medical conditions."

### 2.4 Prompt chips
- One row below the disclaimer, horizontally scrollable inside itself (no wrap, no page overflow).
- Keep the existing chips including the off-topic guard chip. Clicking a chip fills and sends the existing predefined question.

### 2.5 Snapshot bar (metrics)
- A slim bar pinned to the bottom of the RETIS container, full column width or wider (max 1100px), height about 44px.
- Contains one compact chip per metric the app already computes: Avg. blink rate (BPM), Screen distance (cm), Blink alerts, Distance warnings (separate), Longest session, Total validated blinks, Fatigue score (only if the app already computes it). Each chip: label, value with unit, one status pill where the dashboard has one.
- Chips use the dashboard's color roles in Vivid (violet blink, teal distance, orange alerts, yellow longest session, blue total blinks, paper for fatigue) and the frosted surface with accent-colored values in Minimal.
- Clicking or activating a chip sends the predefined question for that metric. Each chip is a real button with an accessible name.
- Secondary details (observed duration, denominator, coverage, calibration detail, 7-day average) move into a keyboard-accessible popover on each chip. Do not delete them.
- The bar scrolls horizontally inside itself if the width is insufficient.
- Right end of the bar: the real data-period and live/paused label.

## 3. Conversation state (after the first message)

```
+--------------------------------------------------------------+
| [top navigation]                                             |
| (mascot 40px) RETIS  [badge]            [Recalibrate]        |
|                                                              |
|                       ... thread column ...                  |
|                                       [ user message ]       |
|   (m) +----------------------------------------+             |
|       | RETIS report card                      |             |
|       +----------------------------------------+             |
|                                                              |
|     +--------------------------------------------------+     |
|     | composer (docked)                                |     |
|     +--------------------------------------------------+     |
|  Snapshot bar (collapsible to a single line)                 |
+--------------------------------------------------------------+
```

- The greeting block collapses to a slim header row: mascot about 40px, "RETIS", connection badge, Recalibrate button.
- The thread fills the remaining height (`flex: 1; min-height: 0; overflow-y: auto`). It is the only scroller. Column max width 820px, centered.
- The composer docks to the bottom of the container, same width and styling as the home state, auto-growing up to 6 lines. Action buttons stay in its footer row. The chip row hides in this state and returns via a "Suggestions" toggle in the composer footer. The snapshot bar remains, with a toggle to collapse it to one line.
- User message: right-aligned rounded bubble, max width 80% of the column.
- RETIS response: report card with mascot avatar (32 to 40px), headline, 2 to 4 sentences, metric chips rendered from the local snapshot, footer "Based on: <period> · <observed time>", an "AI-generated summary" label, and an optional single action button (Start Break navigates to OCURE only and never marks an exercise complete).
- Pending entry: the existing notepad writing indicator, rendered as the last thread entry. Shown only while a request is really pending. Removed on response, error, timeout or cancel. Static glyph under `prefers-reduced-motion`. `role="status"`.
- Auto-scroll to the newest message only when the user is already near the bottom; otherwise show a "Jump to latest" control. The thread is an `aria-live="polite"` region.

## 4. Height and width behavior

- Container height: `100dvh` minus the real top-navigation height, read from the shell's flex layout or a CSS variable, not a hard-coded guess. `overflow: hidden` on the RETIS route container only, as a flex column with `min-height: 0` on shrinking children.
- Other routes keep their existing scrolling. Do not change the global shell for them.
- Must fit with no page scroll at 1440x900, 1366x768, 1350x620 and 1280x600, and at 110% and 125% browser zoom.
- At heights under 700px: mascot shrinks to about 56px, the heading to about 32px, the composer minimum height to about 96px, vertical gaps halve, and the disclaimer joins the snapshot bar line. At heights under 560px, hide the mascot in the home state and keep the heading, composer and snapshot bar.
- The composer must always be visible in the first paint. Verify that `document.documentElement.scrollHeight <= clientHeight` on this route.
- Below 900px width: column becomes full width minus 32px, action button labels collapse to icons with accessible names, the snapshot bar scrolls horizontally.

## 5. Theming

Use the existing token system. Style (Minimal or Vivid), mode (Light or Dark) and Color Studio accent remain three independent preferences. No new theme framework, no hard-coded hues. The reference's pure-black mood is not a fifth theme.

| Combination | Page | Composer card | Chips / snapshot | Notes |
|---|---|---|---|---|
| Vivid Light | existing cream canvas | paper surface, bold outline, hard offset shadow | solid saturated fills, dark text | Keep Vivid outlines and shadows. |
| Vivid Dark | existing Vivid Dark canvas | charcoal surface, visible light outline, hard offset shadow | saturated fills, dark text | Same geometry as Vivid Light, as defined in the Vivid Dark tokens. |
| Minimal Light | existing Minimal Light gradient | frosted white surface, fine border, soft shadow | frosted surface, accent-colored values | Use the existing blur token only. |
| Minimal Dark | existing Minimal Dark gradient | dark frosted surface, fine light border | frosted surface, accent-colored values | Closest to the reference in feel: calm, low contrast chrome. |

- Color Studio accent affects the send button, active chip, focus ring and chart series only.
- Red stays reserved for actual proximity warnings.
- Do not add glows, orbs, animated backgrounds, extra gradients, or diagonal decorative shapes.
- Do not change fonts. Keep the style's existing display and interface fonts.

## 6. Data and behavior contracts (unchanged)

- Every number on screen comes from the same local snapshot code path the dashboard uses. Keep measured zero, missing, untracked, paused and unavailable distinct. Show "No data yet" instead of 0 when there are no observations.
- Gemini: multi-turn chat using the existing integration, the existing RETIS system instruction, a freshly built aggregate snapshot, bounded history and the new message. No webcam frames, no user name, no hardcoded API key. Replies are schema-validated, tokens are substituted from the snapshot, and unknown metric IDs, unknown actions and unsourced numbers are rejected.
- Failure states (missing key, offline, rate limit, timeout, cancel, malformed output): honest error with Retry plus the relevant local values. Never fabricated prose.
- Action cards keep their existing behavior: PDF generated from stored aggregates, eye-comfort heat map of a measured quantity, trends chart with gaps shown as gaps.

## 7. Accessibility

- Every control is keyboard-operable with a visible focus ring. Tab order: top navigation, Recalibrate, composer, action buttons, send, chips, snapshot chips.
- Text contrast at least 4.5:1, large text and UI boundaries at least 3:1, measured against the actual rendered background, including translucent surfaces.
- Icon-only controls have accessible names. Popovers open on focus and Enter, and close on Escape.
- Respect `prefers-reduced-motion`. The only animation on this screen is the notepad indicator.

## 8. Prohibited

- Sparkle or magic-wand icons, "Ask AI" badges, copilot styling, robot avatars, decorative orbs or glows.
- Copying the reference's brand, gradient heading, diagonal shapes or Login button.
- New dependencies for layout, fabricated metrics, placeholder data shown as real, filler status labels.
- Changes to blink detection, camera, tracking, storage, retention, metric formulas, the dashboard, or any other route.

## 9. Acceptance criteria

1. The RETIS route has no page scroll at 1440x900, 1366x768, 1350x620 and 1280x600; the composer is visible on first paint at each size.
2. The home state shows only the greeting, composer, one chip row and one snapshot bar. The thread is the only scroller after the first message.
3. The three action buttons sit inside the composer footer and work as before, including disabled states.
4. All snapshot values equal the dashboard values at the same moment.
5. The connection badge reflects real state only.
6. All four theme combinations render correctly with measured contrast, and switching style, mode or accent mid-conversation keeps the thread and persists after reload.
7. No console errors or layout shift. Other routes are unchanged.

## 10. Delivery report

Run available build, lint and type checks and the app. Provide 1440x900 and 1350x620 screenshots of the home state, conversation state and pending state in all four theme combinations, and the `scrollHeight` check result. Report the exact files changed, checks run, checks not run and remaining limitations. Do not claim anything passed that was not executed. Working application code must change; a plan or documentation edit alone does not count.
