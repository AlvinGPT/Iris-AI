# OCURE_ANIMATION.md — motion, shots, playback

## 1. Shot mapping
| shot | used for | clips |
|---|---|---|
| idle | ready + countdown | idle_loop |
| eyes_closeup | blink, closure, eye-movement steps | eyes_blink_complete, eyes_closure_rest, eyes_horizontal, eyes_vertical, eyes_diagonal |
| face_closeup | settle, breathing, quiet rest | face_settle_breathing, coach_complete |
| medium | shoulder and head-turn steps | shoulder_relax, head_turn_slow |

Each step is 30 s. Each clip is about 8 s, so the player loops it (about 3-4 loops per step). The clips were authored so first and last frames match.

## 2. Playback
- Native <video>, muted, playsinline, no controls, no audio track used. Bundled local files only; no remote URLs.
- One active video element. Preload the next step's clip while the current step runs.
- Use the native loop attribute. Check the loop seam. If a visible stutter appears, report it rather than hiding it.
- Playback never controls timing. The session timer is the source of truth; the clip is decoration of the step.
- Pause: pause the video and the timer together. Resume: continue both.
- Direction: the mascot's gaze moves toward screen-left/right, which equals the user's left/right, matching the captions.

## 3. Transitions (all purposeful, no ornamental motion)
- Step change: 250 ms crossfade between clips; caption text fades 150 ms. Progress segment fills linearly with real elapsed time.
- Ready -> countdown: show 3, 2, 1 as static numerals changing once per second (no scaling or pulsing).
- Completion: crossfade to coach_complete, then show the summary panel.
- Panel and list transitions: 150 ms opacity only.

## 4. Reduced motion
With prefers-reduced-motion, do not autoplay clips. Show the poster/first frame (or the mascot still). Timers, captions, progress and aria-live updates continue. Crossfades become instant.

## 5. Failure behavior
If a clip is missing or fails to load: show the poster, else the mascot still, with the step text and a quiet note "Demonstration video unavailable". Do not substitute unrelated media. The session must run and complete without any clip.

## 6. Prohibited
Zoom/pan effects, parallax, animated gradients, pulsing, bounce, confetti, particles, scroll-linked effects, autoplay audio.
