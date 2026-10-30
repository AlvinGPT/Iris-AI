# OCURE_ACCEPTANCE.md — acceptance criteria and validation

## Acceptance criteria
1. Every start entry point opens the same single coach session. The correct shot and clip play for each step. All six routines run 120 s with correct step boundaries.
2. 20-20-20 and every unsupported item in OCURE_FUNCTION.md section 2 are gone. A repo-wide search returns zero hits, and the report lists each removal.
3. Daily plan: 3-5 offers/day per the quota; never the same routine twice in a day; manual starts count as used; R1 and R2 absent when the latest reliable band is 30+; R1 first when band < 10; no offer when monitoring or active time is unknown.
4. Band classification and selection are pure functions with unit tests: boundaries 9.99, 10.0, 19.99, 20.0, 29.99, 30.0, 39.99, 40.0, 49.99, 50.0; exactly at the minimum observation time; rounded display versus band; insufficient-data gate.
5. Only band < 10 biases toward a blink routine. No copy at 40+ cues extra blinking. No banned wording exists anywhere in the repo (search to confirm).
6. A session is "completed" only after the final step ends or is skipped. Stopped sessions are "stopped_early". Exercise intervals are excluded from blink statistics (numerator and denominator). Monitoring formulas and the pipeline are untouched.
7. With zero clips present, a full session still runs correctly with captions and fallback imagery.
8. All four themes render the coach readably with AA contrast. Style, mode and accent stay independent. Theme switch mid-session does not break the session.
9. Reduced motion: no autoplay; timers and captions still work.
10. The spec files exist, are consistent with the code, and describe only what is implemented.

## Edge-case tests
Insufficient data; pause/resume timing accuracy; stop mid-step; skipping the skippable step; missing or corrupt clip; widget click while a session is active (no second session); app close mid-session (no "completed" record); snooze then decline; quota change mid-day; midnight rollover; resize at 1280x720, 1440x900, 1920x1080.

## Validation and delivery report
Run the available build, type-check, lint and tests. Run the app and inspect the coach screens at desktop size in all four themes. Report: current implementation found before changes, exact files added/changed/removed, verified root findings, what was verified, what was not run, which clips were present or missing, and the loop-seam observation. Do not state that anything passed unless it was run.
