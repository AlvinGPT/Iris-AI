# OCURE_VOICE.md — spoken guidance rules

The Voice feature already exists in the app. Inspect how it speaks (browser speech synthesis, a TTS service, or other) before editing. Do not add a new voice service or dependency.

## 1. Start sequence (no overlap)
Start -> intro line spoken IN FULL -> countdown 3, 2, 1 (1.0 s each, real timestamps) -> step 1 begins.
- The intro is short: one sentence, about 3 seconds or less when spoken. If the current intro is longer, shorten it.
- The countdown starts when the intro's speech-end event fires. If no end event arrives within INTRO_MAX_WAIT_SECONDS (default 6, config), or Voice is off, or the engine errors, start the countdown anyway. Never wait indefinitely.
- Starting step 1 must not cancel the intro or any line in progress.

## 2. During the session
- Speech lines are queued. They never overlap and are never cut off by a new line.
- Priority: step instruction > camera prompt > mid-step nudge. A step-start instruction waits up to 3 s for the current line to finish, then plays; a mid-step nudge that would start while speaking is dropped, not queued.
- Speech never changes the timer, progress bar or clip timing. Only the intro delays anything, and only before the countdown.
- Manual Pause, Stop and switching Voice off cancel the current speech immediately. Resume does not replay old lines. The Repeat button replays the current step instruction.
- Every spoken line is also shown as text.

## 3. Copy rules
Short, imperative, encouraging, no medical claims. Banned wording from OCURE_EXERCISES.md applies.

## 4. Time-based nudges (no camera involved)
The voice only follows the clock. It does not know whether the user is doing the exercise.
- At step start (0 s): speak the step instruction caption.
- At NUDGE_AT_SECONDS (default 15, config): speak "Keep going." followed by the step's mid-step cue from OCURE_EXERCISES.md. One nudge per step.
- Camera prompts are the only speech that mentions the camera or being in view (OCURE_CAMERA_CHECK.md). Nothing is ever described as 'verified'.
- A nudge that would overlap speech in progress is dropped. Nudges are also shown as text.

## 5. Audio output quality (glitch after each line)
- Use ONE shared audio output path for all lines. Do not create or close an AudioContext, audio element or speech utterance per line in a way that clicks.
- For TTS audio played through Web Audio or an audio element: route through one persistent GainNode; apply a short fade-in (about 10 ms) and fade-out (about 20 ms) to every line's buffer, and add about 50 ms of trailing silence. Match the buffer's sample rate to the context. Do not stop(), pause(), cancel() or close at the moment a line ends naturally.
- Instrument each line (dev only): source type, sample rate, duration, amplitude of the last samples, whether any stop/cancel/close ran near the end. A non-zero last sample explains a click.
- If the voice is the browser's built-in speech synthesis, its output cannot be faded in code. State the limitation, avoid cancel() at natural end, and report the voice in use.
- Fades never delay the session clock.
