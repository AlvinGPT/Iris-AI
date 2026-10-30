# RETIS Voice Mode: Live Telemetry Must Stay Fresh During an Active Voice Session

Implement this together with `retis-voice-mode.md`. This file is a bug fix and a requirement for Voice mode. Where it overlaps with the voice-mode file, this file defines data delivery and freshness.

---

## TASK AND OBJECTIVE

In IRIS AI, live telemetry (blink rate, viewing distance and other metrics) updates correctly in the app and is accurate in text chat. In voice mode, the assistant keeps using old values. The latest measurements only reach voice after the user stops and restarts the voice session.

This strongly suggests a stale snapshot, a missing subscription, a disconnected event bridge, or a voice-session lifecycle problem. Inspect the actual source and verify the root cause before changing anything. Voice must answer from the latest valid measurement at response time, in the same session, without a restart.

## CURRENT IMPLEMENTATION (inspect before editing)

Locate the actual implementation of:
- Voice-session creation and initialization.
- The telemetry state or store, and the measurement provider.
- The blink-rate and viewing-distance update paths.
- Any telemetry subscriptions, event emitters, callbacks or data channels.
- The code that builds the initial voice-session context.
- The mechanism that gives application telemetry to the active voice assistant.
- Voice-session cleanup, disconnection and reconnection.

Determine why restarting voice refreshes the data when normal sensor updates do not. Investigate whether:
- Telemetry is read once when voice starts.
- A snapshot or object reference goes stale.
- The live voice connection never receives later updates.
- A React effect has wrong dependencies or captures stale state.
- A callback retains old values.
- The telemetry listener is registered only during initialization.
- A real-time voice connection does not forward application data after initialization.
- The assistant answers from initial instructions or conversation history instead of retrieving current telemetry.

Do not assume React, WebSockets, WebRTC or any particular voice API is responsible unless the project uses it. Report which architecture the voice feature actually uses.

## IMPLEMENTATION REQUIREMENTS

### 1. One authoritative live source
- Reuse the existing sensor pipeline and telemetry store. Text and voice must read the same authoritative measurement state, through the same snapshot builder the dashboard and RETIS text chat use.
- Do not create a second sensor pipeline, duplicate camera subscriptions, or recalculate blink rate or viewing distance independently.
- The live state updates independently of the voice session lifecycle.
- Where available, keep: current values and units, measurement timestamps, reliability and confidence, data freshness, and the existing rolling-window or aggregation metadata.
- Preserve all existing formulas, thresholds and measurement semantics. Do not change units, time windows or denominators.

### 2. Keep voice synchronized without restarting
Use the mechanism that fits the existing voice architecture:
- If voice uses application-side tool or function calls, make every relevant call read the current authoritative state, not a captured snapshot.
- If voice uses a real-time audio connection, use its supported mechanism to deliver structured updates, or expose the current state through a supported tool. Prefer a tool that the model calls on demand (for example, a function that returns the current snapshot) over pushing every update into the model's context.
- If the frontend uses subscriptions or events, make sure the voice integration receives updates and removes its subscriptions on cleanup.
- If a backend holds a separate voice-session context, synchronize current telemetry through the existing supported channel.

Do not assume that changing a JavaScript object, a React state value or a system instruction updates a remote model's existing conversation context. Implement the data delivery the architecture actually requires.

Do not restart the voice connection for each measurement update. Do not send every camera frame or raw sensor event to the model. Send compact structured snapshots or meaningful change events only.

### 3. Fresh values for every relevant question
- Whenever the user asks about a live metric, retrieve the latest valid measurement at response time. Never answer from a value stored in conversation history.
- The snapshot returned to the model carries the metric ID, value, unit, measurement timestamp, age in seconds, a stale or unavailable flag, a reliability flag, and the observed-time basis.
- If a measurement is stale, unavailable or unreliable, say so honestly. Do not invent values, substitute zero, or treat missing telemetry as a successful measurement.
- Define the staleness threshold once, as a named constant, and report it.
- If a metric changes while RETIS is speaking, make the latest value available for the next response, and make sure obsolete asynchronous requests cannot overwrite newer state.
- Numbers spoken or shown must be consistent with the grounding rules in `retis-voice-mode.md`: values come from the snapshot, and any number not traceable to it is flagged.

### 4. Temporary diagnostics
Add development-only diagnostics with timestamps for:
1. Sensor measurement update.
2. Telemetry store update.
3. Telemetry event delivery to the voice integration.
4. Current voice-session ID and connection status.
5. Fresh telemetry retrieval for a response.
6. Value and timestamp supplied to the assistant.
7. Voice response start and first audio playback.

Use a non-sensitive session identifier. Do not log camera frames, audio recordings, API keys or unnecessary personal information. Identify the last point where the value is fresh and the first point where it goes stale. Remove verbose logs or gate them behind the development environment when finished.

### 5. Lifecycle hygiene
- Repeated voice-session creation must not duplicate listeners, subscriptions or sensor processing.
- Closing Voice mode must unsubscribe, stop timers and release resources. Reconnection must rebuild the connection with a fresh snapshot and must not replay stale values.
- Text mode must keep working unchanged.

## DESIGN AND QUALITY CONSTRAINTS

**Product-quality constraint:** Implement this as a deliberate, production-minded change to the existing IRIS AI application. Do not introduce generic AI-themed interface elements, AI-generated visual clichés, unnecessary gradients or glow effects, excessive glassmorphism, decorative cards, meaningless animations, fabricated data, or unrequested features. Preserve the established IRIS design system and existing application architecture. Prioritize functional correctness, visual consistency, maintainable code, accessibility, and verifiable behavior. Do not redesign unrelated areas.

- Make the smallest coherent change that fixes the verified root cause. Fix the root cause, not the symptom (for example, do not just restart the session on a timer).
- Do not add UI for this fix. Do not change blink detection, camera, tracking, storage schema, retention, metric formulas, the dashboard or any other route.
- Test-only value injection must stay out of production builds and must never write into real measurements.

## EDGE CASES AND REGRESSION SAFEGUARDS

- Telemetry paused, camera unavailable, tracking lost, delayed updates, very short observation windows.
- Network disconnection and reconnection of the voice connection mid-session.
- Rapid repeated questions, a question asked while a previous answer is still speaking, and a value that changes mid-answer.
- Multiple open and close cycles of Voice mode in one app session.
- Text chat and the dashboard continue to show identical values at the same moment.

## ACCEPTANCE CRITERIA

The bug is fixed only when all of these hold, verified in one continuous voice session:
- Telemetry continues updating while voice stays active.
- The voice integration can access the latest valid measurements without a restart.
- Repeated questions in the same voice session use current telemetry.
- Text and voice agree when asked about the same snapshot.
- Stale and unavailable measurements are handled honestly, with no zeros and no invented values.
- Camera, blink-rate, viewing-distance and RETIS behavior remain intact.
- The fix is demonstrated with timestamps and real test results.

## VALIDATION AND DELIVERY REPORT

Run the regression test without restarting voice mode:
1. Start voice mode and keep the same session open.
2. Wait for a known blink-rate value to appear in the app.
3. Change the live telemetry to a clearly different controlled value using the existing test harness, or wait for a real sensor update.
4. Verify the telemetry store changes.
5. Ask the assistant for the current blink rate without restarting, and verify the answer uses the latest valid value.
6. Repeat for viewing distance.
7. Repeat several times in the same session.
8. Test stale data, delayed updates, disconnection and reconnection.

Compare the value and timestamp in the telemetry store, the value retrieved by the voice integration and the value used in the response.

Report:
- The verified root cause and which voice architecture the project uses.
- The exact files changed and the live data-delivery mechanism.
- Before and after timestamp evidence.
- Which tests were unit tests, which were mocked integration tests, and which used an actual running voice session. Label anything not run as not run.
- The staleness threshold used, checks run, checks not run and remaining limitations.

Do not claim success because the initial voice context is correct or because restarting voice refreshes the values. The same voice session must receive fresh telemetry while it stays connected.
