# OCURE_EXERCISES.md — exercise content, routines, evidence, copy rules

Human-readable rationale. The operational content must live in ONE typed data module in code (single source of truth). This file must match that module.

## 1. Evidence basis (do not exceed it)
- Blink rate varies with task. Reading averages are often below conversation averages. There is no universal "normal" rate.
- The six rate bands (<10, 10-19, 20-29, 30-39, 40-49, 50+) are descriptive labels only. They have no validated clinical cutoffs.
- Blink-practice evidence exists mainly in people with dry-eye symptoms, over multi-week programs. A 2-minute routine is NOT validated as treatment. Step timings are product choices.
- Neck/shoulder/head movements are general posture and comfort activities. They are not eye exercises and must not be described as helping the eyes or blink rate.
- Not in the library: palming, circular eye rotations, near-to-far focusing, convergence exercises, any claim about improving vision, accommodation or prescription. Remove any of these found in the existing code.
- REMOVE the 20-20-20 rule everywhere (code, constants, copy, docs, widget text, RETIS text). Do not replace it with any other fixed-interval "look away 20 feet" mechanic.

## 2. Global precautions (shown before every session start, and reachable during it)
Blink normally. No squeezing. Do not press on your eyes. Keep your head still during eye movements. Stop if you feel pain, dizziness, double vision or visual disturbance.

## 3. Exercise records (id -> data)
Fields: id, name, kind (blink_specific | general_relaxation | gentle_movement | posture), caption, midCue, precautions, evidenceLevel, evidenceNote, shot, clipId, skippable.

| id | name | kind | shot | clipId | caption | midCue (at 15 s) | evidenceLevel |
|---|---|---|---|---|---|---|---|
| blink_complete | Gentle complete blinks | blink_specific | eyes_closeup | eyes_blink_complete | Blink slowly and fully. | Let your eyelids close softly, then open. No squeezing. | limited (dry-eye populations) |
| eye_closure | Comfortable eye closure | general_relaxation | eyes_closeup | eyes_closure_rest | Close your eyes gently. | Rest them closed for a few seconds, then open. | plausible relaxation only |
| eyes_horizontal | Eyes left and right | gentle_movement | eyes_closeup | eyes_horizontal | Keep your head still. Look slowly to your left, then to your right. | Stay within a comfortable range. | insufficient evidence |
| eyes_vertical | Eyes up and down | gentle_movement | eyes_closeup | eyes_vertical | Keep your head still. Look slowly up, then down. | Slow and comfortable. | insufficient evidence |
| eyes_diagonal | Gentle diagonals | gentle_movement | eyes_closeup | eyes_diagonal | Trace short, slow diagonals with your eyes. | Never rush or strain. | insufficient evidence |
| face_settle | Settle and relax your face | general_relaxation | face_closeup | face_settle_breathing | Settle in. Soften your forehead and jaw. | Blink naturally. | plausible relaxation only |
| breathing_eyes_open | Relaxed breathing | general_relaxation | face_closeup | face_settle_breathing | Breathe slowly. Keep your eyes open and blink naturally. | Do not try to change how often you blink. | plausible relaxation only |
| shoulder_release | Shoulder release | posture | medium | shoulder_relax | Lift your shoulders gently, then let them drop. | Unclench your jaw. | general comfort |
| head_turn | Slow head turns | posture | medium | head_turn_slow | Turn your head slowly a small distance, left then right. | Let your shoulders drop. | general comfort |
| quiet_rest | Quiet rest | general_relaxation | face_closeup | face_settle_breathing | Rest and breathe comfortably. | Let your blinking happen on its own. | plausible relaxation only |

Completion line (clip coach_complete): "Break complete."
Optional-step line (skippable): "Skip this step and rest with your eyes open."

## 4. Routines (120 s each = 4 steps x 30 s). Sequences must differ from each other.
Step 1 = 0-30 s, step 2 = 30-60, step 3 = 60-90, step 4 = 90-120.

| id | name | step 1 | step 2 | step 3 | step 4 |
|---|---|---|---|---|---|
| R1 | Relaxed full-blink practice | blink_complete (about one blink every 3-4 s) | eye_closure | eyes_horizontal | shoulder_release |
| R2 | Gentle blink and eye relaxation | blink_complete (5-8 soft blinks) | eye_closure | eyes_vertical | head_turn |
| R3 | Neutral eye-and-posture reset | breathing_eyes_open | eyes_diagonal | eye_closure | shoulder_release |
| R4 | Relaxation, no extra blinking | face_settle | eye_closure | head_turn | quiet_rest |
| R5 | Neutral relaxation | face_settle | eye_closure | shoulder_release | quiet_rest |
| R6 | Optional relaxation | face_settle | eye_closure (skippable) | shoulder_release | quiet_rest |

Notes:
- R3 step 4 uses shoulder lift-and-drop, not rolls, because no roll clip exists. Do not claim "rolls".
- R5 and R6 contain no deliberate blinking and no eye movement sequences.
- Routine descriptions shown in the UI must be neutral, for example: "A 2-minute break with gentle eye and posture movements."

## 5. Copy rules
Banned (grep the whole repo, including prompts for RETIS/Gemini): treat, treatment, cure, prevent, diagnose, dry eye (as a label for the user), reduce eye strain, improve eyesight, improve vision, normal, abnormal, healthy, unhealthy, fatigued, 20-20-20, "20 feet".
Required framing: rates are "camera-estimated" and vary by task; routines are "optional breaks".
Escalation line (only for 40+ bands, shown as neutral information): "If you have persistent redness, blurry or watering eyes, light sensitivity, or pain, consider seeing an eye-care professional."
