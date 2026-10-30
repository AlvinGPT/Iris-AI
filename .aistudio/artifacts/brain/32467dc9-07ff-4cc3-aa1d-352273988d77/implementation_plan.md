# OCURE Coach — Revision 5 Camera Check, Active-Time Clock & Glitch-Free Voice Guidance

This update upgrades the OCURE 2-minute guided break coach to Revision 5 by introducing the fail-open **Camera Check** comfort aid (`awaiting_user` presence and two-stage step-signal pausing with auto-resume), binding session progress strictly to a single monotonic clock of **active time**, and re-engineering the **Voice Output Pipeline** to route all speech through one persistent Web Audio graph with buffer-level fades, trailing silence, and per-line instrumentation so post-utterance audio clicks are completely eliminated.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following product and UX decisions were confirmed during interactive clarification and govern the implementation:

- **Confirmed Decision 1 — Camera Check Placement**: The **Camera check** toggle switch and the single real-time status line (`"Camera check: watching"`, `"Camera check: presence only"`, `"Camera check: off"`, `"Camera check: camera unavailable"`, `"Paused: we can't see you"`, or `"Paused: waiting for the step"`) will be placed inside the right-hand session panel alongside the Voice status line.
- **Confirmed Decision 2 — Step Guidance & Multi-Rep Sub-Cues**: Keep the multi-rep close/open and directional guided sub-cues during each 30-second step while also supporting the Revision 5 priority speech queue (`step instruction > camera prompt > mid-step nudge`) and two-stage camera signal reminders/pauses.
- **Confirmed Decision 3 — Header Live Status Control**: Preserve the existing **Live Status** spoken check-in button in the top OCURE header bar alongside the **Voice On/Off** and **Precautions** controls.

---

## 1. Overview & Core Concept

- **What It Does**: Guides the user through a 2-minute (4 × 30 s) break routine with synchronized mascot demonstration clips, spoken coaching, and a read-only camera check that gently reminds or pauses the clock if the user leaves the camera view or misses a verifiable step movement.
- **Target Audience / Persona**: Desktop users taking short visual and posture comfort breaks who benefit from hands-free spoken guidance and automatic pause/resume if they step away from their desk.
- **Key Value**:
  - **Accurate Active-Time Pacing**: Both manual pauses and camera-check (`awaiting_user`) pauses freeze the same monotonic session clock and video clip; each of the 4 progress segments fills over 30 s of active time (120 s total active time).
  - **Fail-Open Camera Comfort Aid**: Reuses the existing webcam telemetry stream read-only without storing or uploading frames, never penalizes low confidence, glare, stale data, or unavailable cameras, and caps check-pauses at 2 per step with an explicit **"Continue anyway"** control.
  - **Click-Free Spoken Audio**: Eliminates end-of-line pops/glitches by routing all neural TTS audio through one persistent `AudioContext` and `GainNode`, applying a 10 ms fade-in, 20 ms fade-out, and 50 ms of trailing silence directly to each audio buffer without calling `stop()` or `cancel()` at natural utterance completion.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Ready & Start Sequence**: The user views the single recommended 2-minute routine (or picks another from the compact **Choose another** popover) and clicks **Start 2-Minute Break**. The coach speaks the short 1-sentence intro line in full (or waits at most `INTRO_MAX_WAIT_SECONDS` = 6 s if Voice is off or errors), ticks the `3 → 2 → 1` countdown at exact 1.0 s intervals, and begins Step 1 without cutting off speech.
  2. **Active Step & Presence Check**: Every step monitors face presence after initial tracker warm-up. If the face is continuously absent for `FACE_LOST_PAUSE_SECONDS` (3 s) of reliable tracking, the session enters `awaiting_user` (`face_lost`), freezes the progress bar and clip, displays `"Paused: we can't see you"`, and speaks `"I can't see you. Please move back into view."` When the face returns for `FACE_RETURN_RESUME_SECONDS` (1 s), the session auto-resumes silently.
  3. **Two-Stage Step Signal Check (Verifiable Steps)**:
     - After `STEP_GRACE_SECONDS` (5 s) of active step time, if the expected movement (`blink_complete`, `eye_closure`, or `head_turn`) has not occurred within `COMPLIANCE_WINDOW_SECONDS` (10 s) of reliable tracking, the coach speaks `"Let's keep going."` followed by the step caption while the timer keeps running.
     - If the signal remains absent for another `COMPLIANCE_WINDOW_SECONDS` (10 s), the session enters `awaiting_user` (`signal_missing`), pauses the clock and clip, displays `"Paused: waiting for the step"`, and speaks `"Paused. Do the step to continue."`
     - Performing the movement or clicking **"Continue anyway"** immediately resumes the step. At most `MAX_PAUSES_PER_STEP` (2) check-pauses can occur per step; after 2 pauses, camera check disables for the remainder of that step and records `continued_anyway`. If `awaiting_user` lasts `AWAITING_USER_TIMEOUT_SECONDS` (60 s), the session ends as `stopped_early` with a neutral message.
  4. **Completion Summary**: Displays the 4 steps with their real completion status (`finished` or `skipped`), active elapsed time, and truthful per-step camera check status (`detected`, `presence_only`, `camera_unavailable`, `continued_anyway`, or `check_off`) plus pause and reminder counts. Presence-only steps are never described as verified.

- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Preserves the established IRIS **Minimal** and **Vivid** identities across independent **Light** and **Dark** modes within a strict single-viewport (no vertical scroll at `1280×720`, `1366×768`, `1440×900`, and `1920×1080`).
  - **Color Palette & Mood**: Uses existing theme tokens (`tactile-card-white`, `tactile-inner`, `--theme-accent`) with WCAG AA contrast across all four theme combinations.
  - **Typography & Hierarchy**: `Cormorant Garamond` display headings paired with `DM Sans` UI controls and `tabular-nums` on all countdowns, timers, and step counters.
  - **Component Styling & Layout**: Two-column desktop split (Left 7 columns: 16:9 mascot stage + anchored 1-line caption bar; Right 5 columns: single-elevation session panel with recommendation header, 4-segment active-time progress bar, step instruction box, Camera check switch + single status line next to Voice status, and 52 px primary action button).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Single Shared Web Audio Output Path with Buffer-Level Fades & Silence Padding**:
  - *Chosen Approach*: Maintain one persistent `AudioContext` (24 kHz) and one persistent `GainNode` across the session. Apply a 10 ms linear fade-in, 20 ms linear fade-out, and append 50 ms of zero-amplitude trailing silence directly to every decoded `AudioBuffer` before playback. Let `AudioBufferSourceNode` finish naturally via `onended` without calling `stop()`, `disconnect()`, or `speechSynthesis.cancel()` on natural completion.
  - *Why*: Creating/disconnecting gain nodes or cutting off non-zero final PCM samples causes audible DAC clicks/pops at the end of spoken lines. Modifying the sample envelope and appending 50 ms of trailing silence guarantees the last played sample is `0.0000`.
  - *Alternatives Considered*: Relying solely on `AudioParam.linearRampToValueAtTime` at chunk end was prone to timing jitter between the audio thread and JS `onended` callbacks.

- **Decision 2 — Unified Monotonic Active-Time Clock for Manual & Camera-Check Pauses**:
  - *Chosen Approach*: Compute active session elapsed time as `elapsed = now - sessionStartMs - totalPausedMs`, where both `paused` (manual Pause) and `awaiting_user` (camera check pause) record `pauseStartMs` and accumulate into `totalPausedMs`.
  - *Why*: Guarantees zero timer drift across any combination of manual pauses, face-lost pauses, signal-missing pauses, and "Continue anyway" resumes, while ensuring the 4 progress bar segments fill strictly over 30 s of active time each.
  - *Alternatives Considered*: Frame-based delta counters were rejected because `requestAnimationFrame` throttling or tab switches can introduce cumulative drift.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Existing Vision Pipeline                            │
│  Webcam Stream ──► FaceLandmarker / BlinkDetector / DistanceEstimator      │
│                    (Read-Only Telemetry Subscription: faceDetected,        │
│                     ear, blinkState, totalBlinks, headPose, gaze, quality) │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     OCURE Session & Camera Check Engine                    │
│  ┌──────────────────────────────────┐  ┌────────────────────────────────┐  │
│  │   Monotonic Active-Time Clock    │  │   Revision 5 Camera Checker    │  │
│  │  • ready -> intro -> countdown   │  │  • Warm-up & 5s step grace     │  │
│  │  • step_running (4 × 30s active) │◄─┤  • 3s face_lost -> pause       │  │
│  │  • paused (manual Space)         │  │    + 1s face_return -> resume  │  │
│  │  • awaiting_user (camera check)  │  │  • 10s window 1 -> reminder    │  │
│  │  • completed | stopped_early     │  │  • 10s window 2 -> pause       │  │
│  └─────────────────┬────────────────┘  │  • Max 2 pauses/step; 60s stop │  │
│                    │                   └───────────────┬────────────────┘  │
└────────────────────┼───────────────────────────────────┼───────────────────┘
                     │                                   │
                     ▼                                   ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│        OCURE Coach Screen UI        │  │   Persistent Voice Output Engine  │
│  • 16:9 Mascot Video / Fallback     │  │  • Priority Queue:                │
│  • Anchored Caption Bar (aria-live) │  │    Step > Camera > Nudge (drop)   │
│  • 4-Segment Active Progress Bar    │  │  • 1 Persistent AudioContext      │
│  • Camera Check Switch & Status     │  │    + 1 Persistent GainNode        │
│  • Continue Anyway / Pause / Skip   │  │  • 10ms Fade-In, 20ms Fade-Out    │
│  • Step Summary (counts & statuses) │  │    + 50ms Trailing Silence Buffer │
└─────────────────────────────────────┘  │  • Dev Per-Line Instrumentation   │
                                         └───────────────────────────────────┘
```

### Data Model & State

- **Config Defaults (`OCURE_CONFIG` & `OCURE_CAMERA_CHECK_CONFIG`)**:
  - `MIN_RELIABLE_OBSERVATION_MINUTES: 5`
  - `INTRO_MAX_WAIT_SECONDS: 6`
  - `NUDGE_AT_SECONDS: 15`
  - `FACE_LOST_PAUSE_SECONDS: 3`
  - `FACE_RETURN_RESUME_SECONDS: 1`
  - `STEP_GRACE_SECONDS: 5`
  - `COMPLIANCE_WINDOW_SECONDS: 10`
  - `CLOSURE_MIN_SECONDS: 2`
  - `HEAD_TURN_MIN_DEGREES: 10`
  - `MAX_PAUSES_PER_STEP: 2`
  - `MIN_SECONDS_BETWEEN_SPOKEN_LINES: 8`
  - `AWAITING_USER_TIMEOUT_SECONDS: 60`
- **Session Record (`ExerciseSessionRecord`)**:
  - `routineId`, `bandId` (`null` if manual or unreliable), `trigger` (`plan_accepted | user_started | suggestion_accepted`), `startedAt`, `endedAt`, `status` (`completed | stopped_early`), `elapsedSeconds` (active time), `planOfferId` (nullable), `checkPauseCount` (total session camera pauses), `reminderCount` (total session camera reminders), and `perStepStatus` array containing `stepIndex`, `status` (`finished | skipped`), `cameraCheck` (`detected | presence_only | camera_unavailable | continued_anyway | check_off`), `checkPauseCount`, and `reminderCount`.

### Interactive Component & State Mapping

1. **Start & Intro Speech Handshake**: Clicking **Start 2-Minute Break** transitions to `intro`, speaks the short 1-sentence intro (`"Let's take a two-minute break. Get comfortable."`), and starts the `3, 2, 1` countdown immediately upon the speech `onEnd` event (or after `INTRO_MAX_WAIT_SECONDS` = 6 s if Voice is off or errors).
2. **Camera Check Toggle & Single Status Line**: Toggling the **Camera check** switch in the session panel updates `localStorage` and immediately transitions the live status line between `"Camera check: off"` and the active state (`"Camera check: watching"`, `"Camera check: presence only"`, or `"Camera check: camera unavailable"`). If toggled off while in `awaiting_user`, the session immediately resumes `step_running`.
3. **Awaiting User & "Continue anyway" Control**: When `sessionState === 'awaiting_user'`, the progress bar and video clip freeze, the status line displays `"Paused: we can't see you"` (for `face_lost`) or `"Paused: waiting for the step"` (for `signal_missing`), and a **"Continue anyway"** button is shown alongside **Pause (Space)** and **Stop (Esc)**. Clicking **"Continue anyway"** resumes the step clock and video immediately; if 2 check-pauses have occurred on the current step, further camera checks for that step are disabled and recorded as `continued_anyway`.
4. **Spoken Queue & Audio Instrumentation**: All spoken lines pass through the priority queue (`step instruction` waits up to 3 s if another line is playing; `camera prompt` respects the 8 s cooldown; `mid-step nudge` is dropped if speech is active). Each played line logs a structured dev diagnostic record (`sourceType`, `sampleRate`, `durationSec`, `lastSamplesMaxAmplitude`, `abruptStopCalled`) confirming zero end-of-line amplitude and zero abrupt stops.
5. **Documentation Synchronization**: Update the specification markdown files in `docs/ocure/` (`OCURE_ACCEPTANCE.md`, `OCURE_FUNCTION.md`, `OCURE_VOICE.md`, and `OCURE_CAMERA_CHECK.md`) so the repository specs match Revision 5 and the implemented code.
