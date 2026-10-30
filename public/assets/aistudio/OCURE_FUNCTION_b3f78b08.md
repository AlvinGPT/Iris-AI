# OCURE_FUNCTION.md — behavior, state, data, integration

## 1. Discovery before editing
Inspect: current OCURE page/components, existing exercise data and selection logic, every entry point that starts a break (dashboard OCURE card, OCURE page, widget alert click-through, others), monitoring pipeline and active-time source, local DB + migrations + retention, settings/preference storage, theme system, existing design.md, RETIS and its Gemini reporting. Report findings before changing anything. Do not invent paths, names or schemas.
If the current OCURE uses generated exercise text, a chat-style input, or 20-20-20, replace it with predefined content. Do not touch RETIS reporting except to remove banned wording and 20-20-20 references.

## 2. Removal checklist: 20-20-20 and unsupported content
Search the repo (code, constants, copy, widget strings, docs, RETIS/Gemini prompt templates, tests) for: 20-20-20, "20 feet", "20 minutes" break cadence, palming, circular/rotation eye movements, near-far focusing, convergence. Remove them. Report each removal with file and line. Do not leave dead code or disabled flags.

## 3. Session state machine
ready -> intro speech -> countdown (3 s) -> step_running <-> paused (manual Pause only) ; step_skipped (only skippable steps) -> completed | stopped_early. Nothing automatic pauses or slows the session.
- Controls: Start, Pause/Resume, Stop, Skip (only where allowed). Keyboard: Space = pause/resume, Esc = stop (confirm only if more than one step has run).
- Timers use real timestamps (monotonic clock), not frame counts. Pause/resume must not drift.
- One session at a time. A widget click while a session is active focuses the existing session.
- Completed is recorded only when the final step ends or is skipped. Opening the screen is not "started". Closing the app mid-session records nothing as completed.

## 4. Classification and reliability gate
- Rate = validated blinks / eligible tracked minutes using the app's EXISTING formula. Do not change formulas, thresholds, units or the pipeline.
- Classify the unrounded rate into half-open bands: [0,10), [10,20), [20,30), [30,40), [40,50), [50,inf). Rounded display never changes the band.
- Gate first: if eligible observation time is below MIN_RELIABLE_OBSERVATION_MINUTES (default 5, config, unvalidated), or tracking coverage is poor where the app computes it, return "insufficient reliable data": no band, no personalized suggestion.
- Per band: below 10 -> may bias the daily plan to R1 (see OCURE_DAILY_PLAN.md) and the library may mark R1 "suggested". 10-39 -> neutral information only. 40+ -> no extra-blinking cues; neutral note that the estimate may reflect speaking, irritation or camera error, plus the escalation line from OCURE_EXERCISES.md.
- Suggested copy for below 10: "Your camera-estimated rate was below 10 per minute this session. Rates vary with the task. Would you like a short, gentle blink routine?" (accept / dismiss).
- No LLM is involved in selection, captions or coach lines.

## 5. Monitoring integration
- While a session runs, mark the interval as an exercise interval. Exclude it from BOTH the blink numerator and the eligible-time denominator (excluded, not zero). Suppress blink and proximity alerts during the session.
- Keep proximity alerts as they are. They do not auto-start a break. Any existing click-through opens the OCURE library, not a routine.
- Remove the old long-session break trigger; the daily plan replaces it.

## 6. Session record (existing DB)
routineId, bandId (null if manual or unreliable), trigger (plan_accepted | user_started | suggestion_accepted), startedAt, endedAt, status (completed | stopped_early), per-step status (finished | skipped), elapsedSeconds, planOfferId (nullable). Do not write any camera-check fields.

## 7. States to handle
Loading, empty, insufficient data, clip missing/corrupt, monitoring paused, camera unavailable (sessions still work), reduced motion, theme switch mid-session, window resize.

## 8. Camera check
REMOVED (Revision 4). The coach session does NOT use the camera to check whether the user is doing the exercise. No presence check, no signal check, no Camera check switch, no 'camera verified' status. The step timer and progress are purely time-based: 4 steps x 30 s = 120 s, whether or not the user follows along. The app cannot know whether the exercises were done, so 'completed' means only that the timer ran to the end; the UI must never claim the exercises were performed. Voice rules are in OCURE_VOICE.md.
