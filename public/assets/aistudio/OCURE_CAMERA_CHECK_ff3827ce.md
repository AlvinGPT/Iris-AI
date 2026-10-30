# OCURE_CAMERA_CHECK.md — pause when the user is not doing the step

All numbers are UNVALIDATED product defaults in one config file. Tune only with real camera data. This is a comfort aid, not a measurement or an assessment of anything.

## 1. Principles
- Reuse the existing camera stream and landmark/blink output as a read-only subscription. Do not open a second camera stream. Do not change detection thresholds, formulas or the pipeline. If the pipeline does not expose a needed signal (for example iris or head-rotation values), do NOT add a model or dependency: mark that step not_verifiable.
- Fail open. Pause only when the signal is reliable and clearly absent. Low confidence, glare, glasses, poor light, or camera unavailable must never trap the user.
- Local only. No frames stored or uploaded. Save only per-step status and prompt counts.
- A "Camera check" switch in the session panel (saved with the existing preference mechanism, default on when camera monitoring is permitted). Off or camera unavailable: the session runs normally with the visible note "Camera check off" or "Camera unavailable".
- Exercise-interval rules stay: exercise blinks are excluded from blink statistics, and blink/proximity alerts are suppressed during the session.

## 2. Two checks
A. Presence (every step). If no face is detected for FACE_LOST_PAUSE_SECONDS (default 3), enter awaiting_user (reason face_lost): pause the timer and the clip, show "We can't see you. Move back into view to continue." Resume automatically after the face is present for FACE_RETURN_RESUME_SECONDS (default 1).
B. Step signal (verifiable steps only). After STEP_GRACE_SECONDS (default 5) from step start, require the expected signal at least once within each COMPLIANCE_WINDOW_SECONDS (default 10). If it is missing while tracking confidence is good, enter awaiting_user (reason signal_missing): pause, show "Follow the coach: <caption>". Resume automatically when the signal appears, or when the user presses "Continue anyway". After MAX_PROMPTS_PER_STEP (default 2) prompts in one step, stop prompting for that step and continue with status continued_anyway.

## 3. Signals per exercise
| exercise id | expected signal | check |
|---|---|---|
| blink_complete | blinking activity: at least one blink event per window | verifiable. It shows the user is present and blinking, NOT that blinks were deliberate or complete. |
| eye_closure | eyes closed for at least CLOSURE_MIN_SECONDS (default 2) once per window | verifiable |
| eyes_horizontal, eyes_vertical, eyes_diagonal | iris/gaze displacement in the expected axis with the head roughly still | best effort. Only if gaze data already exists and confidence is good; otherwise not_verifiable (presence only). |
| head_turn | head yaw change of at least HEAD_TURN_MIN_DEGREES (default 10) in the window | verifiable only if head rotation is already available; otherwise not_verifiable |
| shoulder_release | none (shoulders are normally out of frame) | not_verifiable (presence only) |
| face_settle, breathing_eyes_open, quiet_rest | none | not_verifiable (presence only) |

## 4. Statuses saved per step
cameraCheck: detected | not_verifiable | camera_unavailable | continued_anyway | check_off. promptCount: integer. The summary may show a neutral line such as "Camera check: blinking detected" or "Camera check: not available for this step". Never write "verified" for a not_verifiable step.

## 5. Edge cases to test
Face leaves frame and returns; lighting change; glasses with glare (must not pause for signal_missing); camera taken by another app mid-session; check switched off mid-session; two prompts then continue; pause/resume timing stays accurate; theme switch while paused; widget click while awaiting_user.
