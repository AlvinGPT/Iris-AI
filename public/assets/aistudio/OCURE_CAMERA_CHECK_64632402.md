# OCURE_CAMERA_CHECK.md — monitor whether the user is following the step (Revision 5)

Supersedes Revision 4 (removed). Purpose: if the user leaves the frame or clearly does not do a checkable step, bring them back with a spoken prompt and pause the session until they return. This is a comfort aid, not a measurement or an assessment of anything. All numbers are UNVALIDATED product defaults in one config file; tune only with real camera data.

## 1. Principles
- Reuse the existing camera stream and landmark/blink output as a read-only subscription. No second camera stream. Do not change detection thresholds, formulas or the pipeline. If a needed signal (eye-closed, head yaw, gaze) is not exposed, that step is not_verifiable (presence check only). Do not add a model or dependency.
- Fail open. Act only when tracking is reliable and the signal is clearly absent. Low confidence, glare, glasses, a stale or missing camera stream, or camera unavailable must never pause the session. "No data yet" is NOT "no face": do nothing until the tracker has produced recent results.
- Local only. No frames stored or uploaded. Save only per-step status and counts.
- A "Camera check" switch in the session panel (existing preference mechanism, default on when camera monitoring is permitted). Off or unavailable: the session runs as a plain timer with a visible note.

## 2. Behavior
A. Presence (every step): face not detected for FACE_LOST_PAUSE_SECONDS (default 3) of continuous reliable tracking -> enter awaiting_user (reason face_lost): pause the session clock and the clip, speak "I can't see you. Please move back into view." Auto-resume after the face is present for FACE_RETURN_RESUME_SECONDS (default 1). No spoken line on resume.
B. Step signal (verifiable steps only), two stages:
  1. After STEP_GRACE_SECONDS (default 5) of ACTIVE step time, if the expected signal has not appeared within COMPLIANCE_WINDOW_SECONDS (default 10) with good confidence -> spoken reminder "Let's keep going." + the step caption. The session keeps running.
  2. If the signal is still absent after one more COMPLIANCE_WINDOW_SECONDS -> enter awaiting_user (reason signal_missing): pause, speak "Paused. Do the step to continue." Auto-resume as soon as the signal appears, or when the user presses "Continue anyway".
C. Limits: at most MAX_PAUSES_PER_STEP (default 2) check-pauses per step; after that the check is off for the rest of that step (status continued_anyway). Spoken lines are at least MIN_SECONDS_BETWEEN_SPOKEN_LINES (default 8) apart and never overlap other speech. If awaiting_user lasts AWAITING_USER_TIMEOUT_SECONDS (default 60), end the session as stopped_early with a neutral message.

## 3. Clock rules (the previous timer complaint)
- awaiting_user freezes the session clock exactly like manual Pause: elapsed = now - start - totalPausedTime (manual + check pauses). Progress, step index and total remaining count ACTIVE time only, so a routine with pauses takes longer than 120 s of wall time. That is expected.
- While paused for any reason, the panel must show a clear paused state and its reason, and the progress bar must visibly stop. The first 5 s of a step never trigger a signal check. The initial tracker warm-up never triggers a presence pause.

## 4. Signals per exercise
| exercise id | expected signal | check |
|---|---|---|
| blink_complete | at least one blink event per window | verifiable. Shows presence and blinking, NOT deliberate or complete blinks. |
| eye_closure | eyes closed at least CLOSURE_MIN_SECONDS (default 2) once per window | verifiable |
| eyes_horizontal, eyes_vertical, eyes_diagonal | gaze displacement in the expected axis, head roughly still | best effort, only if gaze data already exists and confidence is good; otherwise presence only |
| head_turn | head yaw change of at least HEAD_TURN_MIN_DEGREES (default 10) | only if head rotation already exists; otherwise presence only |
| shoulder_release, face_settle, breathing_eyes_open, quiet_rest | none | presence only (shoulders are normally out of frame) |

## 5. Status line (real state only; never the word "verified" or "Following step")
"Camera check: watching" | "Camera check: presence only" | "Camera check: off" | "Camera check: camera unavailable" | "Paused: we can't see you" | "Paused: waiting for the step". Show one status in one place.

## 6. Saved per step
cameraCheck: detected | presence_only | camera_unavailable | continued_anyway | check_off; checkPauseCount; reminderCount. Summary shows real counts; never says a presence_only step was verified. Because pauses and the 60 s timeout exist, "completed" still means only that active time reached 120 s.

## 7. Edge cases
Face leaves and returns; glasses with glare (must not pause for a missing signal); lighting change; camera taken by another app mid-session; check switched off or on mid-session; two pauses then continue; manual Pause while awaiting_user; Stop while paused; theme switch while paused; widget click while paused; stale tracker output.
