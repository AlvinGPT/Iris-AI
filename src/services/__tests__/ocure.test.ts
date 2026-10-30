/**
 * OCURE PURE FUNCTIONS, CAMERA CHECK REVISION 5, VOICE REVISION 5 & DATA INTEGRITY UNIT TESTS
 * Verifies all criteria 1–19 in OCURE_ACCEPTANCE.md (Revision 5).
 */

import * as fs from 'fs';
import {
  classifyBlinkRate,
  selectNextRoutine,
  OcureDailyPlanService,
  OcureExerciseVerificationMachine,
  OCURE_CONFIG,
  OCURE_CAMERA_CHECK_CONFIG,
  ACTIVITY_PAUSED_MESSAGE,
  FACE_LOST_PAUSED_MESSAGE,
  isExerciseVerifiable,
  isPresenceOnlyExercise,
  getExerciseDetectionCriteria,
  extractExerciseMotionFeatures,
  computeStartSequenceTimings,
  computeActiveSessionClock,
} from '../ocureService';
import {
  ROUTINES,
  ROUTINE_ORDER,
  EXERCISES,
  CLIP_MANIFEST,
  OCURE_SESSION_VOICE_SCRIPTS,
  STEP_TRANSITION_LEAD_INS,
  buildCameraSignalReminderText,
  buildStepMidNudgeText,
  buildLiveBlinkRateVoiceUpdate,
  buildLiveDistanceVoiceUpdate,
  buildCombinedLiveStatusVoiceUpdate,
} from '../../data/ocureExercises';
import {
  extractPcmBytesFromWavOrRaw,
  sanitizeAndTaperPcmSamples,
  inspectSanitizedBufferEnd,
  normalizeTextForSpeech,
  splitIntoConversationalSentences,
  OCURE_NEURAL_VOICE_NAME,
  OCURE_NEURAL_VOICE_DESCRIPTION,
  OCURE_NEURAL_VOICE_ID,
  OCURE_AISTUDIO_VOICE_PRESET_ID,
  OCURE_AUDIO_CONFIG,
  ocureVoiceService,
} from '../ocureVoiceService';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('--- TEST 1: Reliability Gate & Insufficient Data ---');
const r1 = classifyBlinkRate(15, 299, 100);
assert(r1.reliable === false, '4.98m observation is marked unreliable');
assert(r1.band === null, 'Band is null when under 5 min observation');
assert(r1.statusLabel === 'insufficient reliable data', 'Status label is "insufficient reliable data"');

const r2 = classifyBlinkRate(15, 600, 48);
assert(r2.reliable === false, 'Poor tracking coverage (< 50%) is marked unreliable');
assert(r2.band === null, 'Band is null when tracking coverage is poor');

const r3 = classifyBlinkRate(null, 600, 100);
assert(r3.reliable === false, 'Null rate is marked unreliable');
assert(r3.band === null, 'Band is null when rate is null');

const r4 = classifyBlinkRate(15, 300, 100);
assert(r4.reliable === true, 'Exactly 5m (300s) observation passes gate');
assert(r4.band === '10_20', 'Rate 15 falls in band 10_20');

console.log('\n--- TEST 2: Exact Half-Open Band Boundaries ---');
assert(classifyBlinkRate(0.0, 300, 100).band === '0_10', '0.0 falls in 0_10');
assert(classifyBlinkRate(9.99, 300, 100).band === '0_10', '9.99 falls in 0_10');
assert(classifyBlinkRate(10.0, 300, 100).band === '10_20', '10.0 falls in 10_20');
assert(classifyBlinkRate(19.99, 300, 100).band === '10_20', '19.99 falls in 10_20');
assert(classifyBlinkRate(20.0, 300, 100).band === '20_30', '20.0 falls in 20_30');
assert(classifyBlinkRate(29.99, 300, 100).band === '20_30', '29.99 falls in 20_30');
assert(classifyBlinkRate(30.0, 300, 100).band === '30_40', '30.0 falls in 30_40');
assert(classifyBlinkRate(39.99, 300, 100).band === '30_40', '39.99 falls in 30_40');
assert(classifyBlinkRate(40.0, 300, 100).band === '40_50', '40.0 falls in 40_50');
assert(classifyBlinkRate(49.99, 300, 100).band === '40_50', '49.99 falls in 40_50');
assert(classifyBlinkRate(50.0, 300, 100).band === '50_plus', '50.0 falls in 50_plus');
assert(classifyBlinkRate(75.5, 300, 100).band === '50_plus', '75.5 falls in 50_plus');
assert(classifyBlinkRate(25, 300, 100).escalationNote === undefined, 'No escalation note at 25 bpm');
assert(typeof classifyBlinkRate(42, 300, 100).escalationNote === 'string', 'Escalation note present at 42 bpm');

console.log('\n--- TEST 3: Routine Data Integrity ---');
assert(ROUTINE_ORDER.length === 6, 'Exactly 6 routines defined in ROUTINE_ORDER');

for (const rId of ROUTINE_ORDER) {
  const routine = ROUTINES[rId];
  assert(!!routine, `Routine ${rId} exists`);
  assert(routine.totalDurationSeconds === 120, `Routine ${rId} total duration is exactly 120s`);
  assert(routine.steps.length === 4, `Routine ${rId} has exactly 4 steps`);

  let totalStepSec = 0;
  for (let sIdx = 0; sIdx < routine.steps.length; sIdx++) {
    const step = routine.steps[sIdx];
    assert(step.durationSeconds === 30, `Routine ${rId} step ${sIdx + 1} duration is 30s`);
    totalStepSec += step.durationSeconds;

    const exercise = EXERCISES[step.exerciseId];
    assert(!!exercise, `Routine ${rId} step ${sIdx + 1} exercise ${step.exerciseId} exists in EXERCISES`);
    assert(!!CLIP_MANIFEST[exercise.clipId], `Exercise ${exercise.id} clip ${exercise.clipId} exists in CLIP_MANIFEST`);

    if (rId === 'R6' && sIdx === 1) {
      assert(step.skippable === true, 'Routine R6 step 2 (eye_closure) is skippable: true');
    } else {
      assert(step.skippable === false, `Routine ${rId} step ${sIdx + 1} is skippable: false`);
    }
  }
  assert(totalStepSec === 120, `Routine ${rId} step durations sum to 120s`);
}

const rounded999 = classifyBlinkRate(9.99, 300, 100);
assert(
  Math.round(9.99) === 10 && rounded999.band === '0_10',
  'Rate 9.99 rounds to 10 for display but remains in band 0_10'
);
const rounded2999 = classifyBlinkRate(29.99, 300, 100);
assert(
  Math.round(29.99) === 30 && rounded2999.band === '20_30',
  'Rate 29.99 rounds to 30 for display but remains in band 20_30'
);

console.log('\n--- TEST 4: Pure Routine Selection Function ---');
const selLow = selectNextRoutine({
  todayUsedRoutineIds: [],
  latestReliableBand: '0_10',
  localDateOrdinal: 1,
});
assert(selLow?.id === 'R1', 'Band < 10 selects R1 first');

const selLowUsed = selectNextRoutine({
  todayUsedRoutineIds: ['R1'],
  latestReliableBand: '0_10',
  localDateOrdinal: 0,
});
assert(selLowUsed?.id !== 'R1', 'Does not re-offer R1 if already used today');

const selHigh30 = selectNextRoutine({
  todayUsedRoutineIds: [],
  latestReliableBand: '30_40',
  localDateOrdinal: 0,
});
assert(selHigh30?.id !== 'R1' && selHigh30?.id !== 'R2', 'Band 30-40 excludes R1 and R2');

const selHigh50 = selectNextRoutine({
  todayUsedRoutineIds: [],
  latestReliableBand: '50_plus',
  localDateOrdinal: 0,
});
assert(selHigh50?.id !== 'R1' && selHigh50?.id !== 'R2', 'Band 50+ excludes R1 and R2');

const selEmpty = selectNextRoutine({
  todayUsedRoutineIds: ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
  latestReliableBand: '10_20',
  localDateOrdinal: 5,
});
assert(selEmpty === null, 'Returns null when all routines have been used today');

const selFirstAvoid = selectNextRoutine({
  todayUsedRoutineIds: [],
  latestReliableBand: null,
  localDateOrdinal: 0,
  yesterdayFirstOfferedRoutineId: 'R2',
  isFirstOfferOfDay: true,
});
assert(selFirstAvoid?.id !== 'R2', 'First offer of day avoids yesterday first offer');

console.log('\n--- TEST 5: Revision 5 Config Defaults & Boundaries ---');
assert(OCURE_CONFIG.MAX_DAILY_BREAKS === 5, 'MAX_DAILY_BREAKS is 5');
assert(OCURE_CONFIG.DEFAULT_DAILY_QUOTA === 5, 'Default quota is 5');
assert(OCURE_CONFIG.MIN_QUOTA === 3, 'Min quota is 3');
assert(OCURE_CONFIG.MAX_QUOTA === 5, 'Max quota is 5');
assert(OCURE_CONFIG.MIN_ACTIVE_MINUTES_BETWEEN_OFFERS === 60, '60 minutes active screen time between offers');
assert(OCURE_CONFIG.SNOOZE_MINUTES === 10, 'Snooze duration is 10 minutes');
assert(OCURE_CONFIG.INTRO_MAX_WAIT_SECONDS === 6, 'INTRO_MAX_WAIT_SECONDS is 6 (OCURE_VOICE.md §1)');
assert(OCURE_CONFIG.NUDGE_AT_SECONDS === 15, 'NUDGE_AT_SECONDS is 15 (OCURE_VOICE.md §4)');

assert(OCURE_CAMERA_CHECK_CONFIG.FACE_LOST_PAUSE_SECONDS === 3, 'FACE_LOST_PAUSE_SECONDS is 3');
assert(OCURE_CAMERA_CHECK_CONFIG.FACE_RETURN_RESUME_SECONDS === 1, 'FACE_RETURN_RESUME_SECONDS is 1');
assert(OCURE_CAMERA_CHECK_CONFIG.STEP_GRACE_SECONDS === 5, 'STEP_GRACE_SECONDS is 5');
assert(OCURE_CAMERA_CHECK_CONFIG.COMPLIANCE_WINDOW_SECONDS === 10, 'COMPLIANCE_WINDOW_SECONDS is 10');
assert(OCURE_CAMERA_CHECK_CONFIG.CLOSURE_MIN_SECONDS === 2, 'CLOSURE_MIN_SECONDS is 2');
assert(OCURE_CAMERA_CHECK_CONFIG.HEAD_TURN_MIN_DEGREES === 10, 'HEAD_TURN_MIN_DEGREES is 10');
assert(OCURE_CAMERA_CHECK_CONFIG.MAX_PAUSES_PER_STEP === 2, 'MAX_PAUSES_PER_STEP is 2');
assert(OCURE_CAMERA_CHECK_CONFIG.MIN_SECONDS_BETWEEN_SPOKEN_LINES === 8, 'MIN_SECONDS_BETWEEN_SPOKEN_LINES is 8');
assert(OCURE_CAMERA_CHECK_CONFIG.AWAITING_USER_TIMEOUT_SECONDS === 60, 'AWAITING_USER_TIMEOUT_SECONDS is 60');

console.log('\n--- TEST 6: Signals Per Exercise & Presence-Only Classification (OCURE_CAMERA_CHECK.md §4) ---');
const verifiableExercises = [
  'blink_complete',
  'eye_closure',
  'head_turn',
  'eyes_horizontal',
  'eyes_vertical',
  'eyes_diagonal',
];
const presenceOnlyExercises = [
  'shoulder_release',
  'face_settle',
  'breathing_eyes_open',
  'quiet_rest',
];

for (const id of verifiableExercises) {
  assert(isExerciseVerifiable(id) === true, `${id} is verifiable when sensor data exists`);
  const criteria = getExerciseDetectionCriteria(id);
  assert(Boolean(criteria && criteria.verifiable === true), `${id} profile has verifiable: true`);
}

for (const id of presenceOnlyExercises) {
  assert(isExerciseVerifiable(id) === false && isPresenceOnlyExercise(id) === true, `${id} is presence_only (never pauses for missing step signal)`);
  const m = new OcureExerciseVerificationMachine(id, 30);
  m.start(1000);
  const snap = m.tick({
    timestampMs: 1050,
    isMonitoring: true,
    cameraStatus: 'active',
    faceDetected: true,
    isReliable: true,
    combinedAperture: 0.28,
    closureThresholdEAR: 0.19,
    reopenThresholdEAR: 0.23,
    eyeClosureScore: 0.05,
    blinkState: 'OPEN',
    cameraCheckEnabled: true,
    isSpeechActive: false,
  });
  assert(
    snap.statusCaption === 'Camera check: presence only' &&
      m.getStepCameraCheckStatus(true) === 'presence_only',
    `${id} reports "Camera check: presence only" and saves cameraCheck: 'presence_only'`
  );
}

// Gaze exercises without gaze data fall back to presence_only
assert(
  isExerciseVerifiable('eyes_horizontal', { hasGazeData: false }) === false,
  'eyes_horizontal without gaze data falls back to presence_only'
);
assert(
  isExerciseVerifiable('head_turn', { hasHeadRotation: false }) === false,
  'head_turn without head rotation data falls back to presence_only'
);

console.log('\n--- TEST 7: OCURE Coach Voice Scripts & Exact Text-Speech Parity (Criterion 18) ---');
const seenInstructionIds = new Set<string>();
for (const [exId, ex] of Object.entries(EXERCISES)) {
  assert(Boolean(ex.instructionId && ex.instructionId.startsWith('inst_')), `Exercise ${exId} has stable instructionId ${ex.instructionId}`);
  assert(!seenInstructionIds.has(ex.instructionId), `Exercise ${exId} instructionId ${ex.instructionId} is unique`);
  seenInstructionIds.add(ex.instructionId);
  assert(Boolean(ex.spokenInstruction && ex.spokenInstruction.length > 10), `Exercise ${exId} has spokenInstruction`);
  assert(Boolean(ex.spokenMidCue && ex.spokenMidCue.length > 5), `Exercise ${exId} has spokenMidCue`);
  assert(typeof ex.repeatOnResume === 'boolean', `Exercise ${exId} defines repeatOnResume boolean`);
}

assert(
  OCURE_SESSION_VOICE_SCRIPTS.countdown_start.spokenText ===
    "Let's take a quick two-minute break together." &&
    splitIntoConversationalSentences(OCURE_SESSION_VOICE_SCRIPTS.countdown_start.spokenText).length === 1,
  'OCURE_VOICE.md §1: Intro line is one short sentence (~3 seconds or less)'
);
assert(
  OCURE_SESSION_VOICE_SCRIPTS.camera_pause_presence.spokenText ===
    "I can't see you. Please move back into view.",
  'OCURE_CAMERA_CHECK.md §2A: Presence pause spoken prompt is exact'
);
assert(
  OCURE_SESSION_VOICE_SCRIPTS.camera_pause_signal.spokenText ===
    'Paused. Do the step to continue.',
  'OCURE_CAMERA_CHECK.md §2B: Signal missing pause spoken prompt is exact'
);
assert(
  buildCameraSignalReminderText('blink_complete') ===
    "Let's keep going. Blink slowly and fully.",
  'OCURE_CAMERA_CHECK.md §2B: Stage 1 signal reminder combines "Let\'s keep going." + step caption'
);
assert(
  buildStepMidNudgeText('blink_complete') ===
    'Keep going. Let your eyelids close softly, then open. No squeezing.',
  'OCURE_VOICE.md §4: 15s mid-step nudge combines "Keep going." + step midCue'
);

console.log('\n--- TEST 8: Conversational Voice Normalization, Meditation Guide Identity & Audio Config (OCURE_VOICE.md §5) ---');
assert(OCURE_NEURAL_VOICE_NAME === 'Meditation Guide', 'OCURE_NEURAL_VOICE_NAME is "Meditation Guide"');
assert(OCURE_NEURAL_VOICE_DESCRIPTION === 'Airy & soothing', 'OCURE_NEURAL_VOICE_DESCRIPTION is "Airy & soothing"');
assert(OCURE_NEURAL_VOICE_ID === 'voice_unkpf0tjxq6l', 'OCURE_NEURAL_VOICE_ID is "voice_unkpf0tjxq6l"');
assert(OCURE_AISTUDIO_VOICE_PRESET_ID === 'voice-meditation-guide', 'OCURE_AISTUDIO_VOICE_PRESET_ID is "voice-meditation-guide"');

const engineInfo = ocureVoiceService.getActiveEngineInfo();
assert(
  engineInfo.voiceName === 'Meditation Guide' &&
    engineInfo.voiceId === 'voice_unkpf0tjxq6l' &&
    engineInfo.limitationNote.includes('cannot be faded in code'),
  'ocureVoiceService.getActiveEngineInfo() reports Meditation Guide and states browser speechSynthesis limitation'
);
assert(
  OCURE_AUDIO_CONFIG.FADE_IN_MS === 10 &&
    OCURE_AUDIO_CONFIG.FADE_OUT_MS === 20 &&
    OCURE_AUDIO_CONFIG.TRAILING_SILENCE_MS === 50,
  'OCURE_AUDIO_CONFIG has 10ms fade-in, 20ms fade-out, and 50ms trailing silence (OCURE_VOICE.md §5)'
);
assert(
  normalizeTextForSpeech('Your rate is 14 BPM at 58 cm for 3-4 s.') ===
    'Your rate is 14 blinks per minute at 58 centimeters for 3 to 4 seconds.',
  'normalizeTextForSpeech expands BPM, cm, and 3-4 s naturally'
);
assert(
  Boolean(STEP_TRANSITION_LEAD_INS[1] && STEP_TRANSITION_LEAD_INS[2] && STEP_TRANSITION_LEAD_INS[3]),
  'STEP_TRANSITION_LEAD_INS defined for steps 2, 3, and 4'
);

const liveBlinkLow = buildLiveBlinkRateVoiceUpdate({
  isMonitoring: true,
  faceDetected: true,
  avgBlinkRate: 8,
  observationSeconds: 120,
  isCalibrated: true,
  avgScreenDistance: 58,
});
const liveDistGood = buildLiveDistanceVoiceUpdate({
  isMonitoring: true,
  faceDetected: true,
  avgBlinkRate: 16,
  observationSeconds: 120,
  isCalibrated: true,
  avgScreenDistance: 58,
});
const combinedLive = buildCombinedLiveStatusVoiceUpdate({
  isMonitoring: true,
  faceDetected: true,
  avgBlinkRate: 15,
  observationSeconds: 180,
  isCalibrated: true,
  avgScreenDistance: 58,
});
assert(
  liveBlinkLow.includes('8 blinks a minute') &&
    liveDistGood.includes('58 centimeters') &&
    combinedLive.includes('15 blinks a minute'),
  'Live telemetry voice builders reflect measured BPM and screen distance dynamically'
);

console.log('\n--- TEST 9: Revision 5 Camera Check Behavior (Criterion 14 & OCURE_CAMERA_CHECK.md §2–§7) ---');
let simClockMs = 1000;
const stepClock = (deltaMs: number) => {
  simClockMs += deltaMs;
  return simClockMs;
};

const makeOpenFrame = (
  deltaMs = 100,
  extra: Partial<Parameters<OcureExerciseVerificationMachine['tick']>[0]> = {}
) => ({
  timestampMs: stepClock(deltaMs),
  isMonitoring: true,
  cameraStatus: 'active',
  faceDetected: true,
  isReliable: true,
  blinkState: 'OPEN',
  eyeClosureScore: 0.08,
  combinedAperture: 0.28,
  closureThresholdEAR: 0.19,
  reopenThresholdEAR: 0.23,
  headYaw: 0,
  cameraCheckEnabled: true,
  isSpeechActive: false,
  ...extra,
});

const makeClosedFrame = (
  deltaMs = 100,
  extra: Partial<Parameters<OcureExerciseVerificationMachine['tick']>[0]> = {}
) => ({
  timestampMs: stepClock(deltaMs),
  isMonitoring: true,
  cameraStatus: 'active',
  faceDetected: true,
  isReliable: true,
  blinkState: 'CLOSED',
  eyeClosureScore: 0.85,
  combinedAperture: 0.12,
  closureThresholdEAR: 0.19,
  reopenThresholdEAR: 0.23,
  headYaw: 0,
  cameraCheckEnabled: true,
  isSpeechActive: false,
  ...extra,
});

const makeNoFaceFrame = (
  deltaMs = 100,
  extra: Partial<Parameters<OcureExerciseVerificationMachine['tick']>[0]> = {}
) => ({
  timestampMs: stepClock(deltaMs),
  isMonitoring: true,
  cameraStatus: 'active',
  faceDetected: false,
  isReliable: false,
  blinkState: 'OPEN',
  eyeClosureScore: 0,
  combinedAperture: 0.28,
  closureThresholdEAR: 0.19,
  reopenThresholdEAR: 0.23,
  headYaw: 0,
  cameraCheckEnabled: true,
  isSpeechActive: false,
  ...extra,
});

// 9A. Presence pause (3 s face lost) -> spoken prompt -> silent auto-resume after 1 s face present
{
  const m = new OcureExerciseVerificationMachine('blink_complete', 30);
  m.start(simClockMs);
  // 2.0 s of active tracking first
  for (let i = 0; i < 20; i++) m.tick(makeOpenFrame(100));
  const activeBeforeFaceLost = m.getVerifiedActiveSeconds();

  // Face leaves for 3.0 s (30 x 100ms)
  let snap = m.tick(makeNoFaceFrame(100));
  let spokenOnFaceLost: string | null = snap.promptToSpeak?.spokenText || null;
  for (let i = 1; i < 30; i++) {
    snap = m.tick(makeNoFaceFrame(100));
    if (snap.promptToSpeak) spokenOnFaceLost = snap.promptToSpeak.spokenText;
  }

  assert(
    snap.isAwaitingUser === true &&
      snap.awaitingReason === 'face_lost' &&
      snap.isTimerAdvancing === false &&
      snap.statusCaption === FACE_LOST_PAUSED_MESSAGE &&
      snap.checkPauseCount === 1 &&
      spokenOnFaceLost === "I can't see you. Please move back into view.",
    `9A.1: Face lost for 3.0s enters awaiting_user (face_lost), pauses clock, shows "${FACE_LOST_PAUSED_MESSAGE}", and speaks "${spokenOnFaceLost}"`
  );

  // Stay face-lost for another 2.0 s -> active time remains frozen
  const frozenMs = snap.verifiedActiveMs;
  for (let i = 0; i < 20; i++) {
    snap = m.tick(makeNoFaceFrame(100));
  }
  assert(
    snap.verifiedActiveMs === frozenMs,
    `9A.2: Session clock stays frozen at ${frozenMs}ms while awaiting_user (face_lost)`
  );

  // Face returns: after 0.5 s (< 1.0 s), still paused; after 1.0 s (FACE_RETURN_RESUME_SECONDS), auto-resumes with NO spoken line!
  for (let i = 0; i < 5; i++) {
    snap = m.tick(makeOpenFrame(100));
  }
  assert(snap.isAwaitingUser === true, '9A.3: At 0.5s face return (< 1.0s), still waiting to confirm return');

  let spokenOnResume: string | null = null;
  for (let i = 0; i < 5; i++) {
    snap = m.tick(makeOpenFrame(100));
    if (snap.promptToSpeak) spokenOnResume = snap.promptToSpeak.spokenText;
  }
  assert(
    snap.isAwaitingUser === false &&
      snap.isTimerAdvancing === true &&
      spokenOnResume === null &&
      snap.statusCaption === 'Camera check: watching',
    '9A.4: After 1.0s face return, auto-resumes silently with no spoken line'
  );
  void activeBeforeFaceLost;
}

// 9B. Two-stage step signal check on verifiable step (blink_complete):
// - First 5s (STEP_GRACE_SECONDS): no signal check
// - Next 10s (COMPLIANCE_WINDOW_SECONDS, total 15s active): Stage 1 reminder ("Let's keep going. Blink slowly and fully."), session keeps running!
// - Next 10s (COMPLIANCE_WINDOW_SECONDS, total 25s active): Stage 2 awaiting_user (signal_missing), pauses clock, speaks "Paused. Do the step to continue."
// - Auto-resumes as soon as blink signal appears!
{
  const m = new OcureExerciseVerificationMachine('blink_complete', 30);
  m.start(simClockMs);

  let stage1Prompt: string | null = null;
  let stage1ActiveMs = 0;
  let stage2Prompt: string | null = null;
  let stage2ActiveMs = 0;

  // Run 15.0 seconds of active time with eyes wide open (no blinks)
  let snap = m.tick(makeOpenFrame(100));
  for (let i = 1; i < 150; i++) {
    snap = m.tick(makeOpenFrame(100));
    if (snap.promptToSpeak) {
      stage1Prompt = snap.promptToSpeak.spokenText;
      stage1ActiveMs = snap.verifiedActiveMs;
    }
  }

  assert(
    snap.isAwaitingUser === false &&
      snap.isTimerAdvancing === true &&
      snap.reminderCount === 1 &&
      stage1Prompt === "Let's keep going. Blink slowly and fully." &&
      stage1ActiveMs === 15000,
    `9B.1: Stage 1 at 15.0s (5s grace + 10s window) emits reminder "${stage1Prompt}" while session keeps running`
  );

  // Run another 10.0 seconds (total 25.0s active time) with eyes still wide open
  for (let i = 0; i < 100; i++) {
    snap = m.tick(makeOpenFrame(100));
    if (snap.promptToSpeak) {
      stage2Prompt = snap.promptToSpeak.spokenText;
      stage2ActiveMs = snap.verifiedActiveMs;
    }
  }

  assert(
    snap.isAwaitingUser === true &&
      snap.awaitingReason === 'signal_missing' &&
      snap.isTimerAdvancing === false &&
      snap.checkPauseCount === 1 &&
      snap.statusCaption === ACTIVITY_PAUSED_MESSAGE &&
      stage2Prompt === 'Paused. Do the step to continue.' &&
      stage2ActiveMs === 24900,
    `9B.2: Stage 2 after second 10s window enters awaiting_user (signal_missing), pauses clock, shows "${ACTIVITY_PAUSED_MESSAGE}", and speaks "${stage2Prompt}"`
  );

  // User now performs a blink -> auto-resumes immediately!
  snap = m.tick(makeClosedFrame(100));
  assert(
    snap.isAwaitingUser === false &&
      snap.isTimerAdvancing === true &&
      m.getStepCameraCheckStatus(true) === 'detected',
    '9B.3: Auto-resumes immediately when user performs blink signal and records cameraCheck: "detected"'
  );
}

// 9C. Max 2 check-pauses per step (MAX_PAUSES_PER_STEP = 2) -> turns off check for rest of step (continued_anyway)
{
  const m = new OcureExerciseVerificationMachine('blink_complete', 30);
  m.start(simClockMs);

  // Pause 1 via face_lost (3s) -> return (1s)
  for (let i = 0; i < 30; i++) m.tick(makeNoFaceFrame(100));
  assert(m.getCheckPauseCount() === 1, '9C.1: First check-pause recorded (count = 1)');
  for (let i = 0; i < 10; i++) m.tick(makeOpenFrame(100));

  // Pause 2 via face_lost (3s) -> return (1s)
  for (let i = 0; i < 30; i++) m.tick(makeNoFaceFrame(100));
  assert(m.getCheckPauseCount() === 2, '9C.2: Second check-pause recorded (count = 2)');
  let snap = m.tick(makeOpenFrame(100));
  for (let i = 1; i < 10; i++) snap = m.tick(makeOpenFrame(100));
  assert(snap.isAwaitingUser === false, '9C.3: Resumed after 2nd check-pause');

  // Now lose face again for 5 seconds -> must NOT pause a 3rd time!
  for (let i = 0; i < 50; i++) {
    snap = m.tick(makeNoFaceFrame(100));
  }
  assert(
    snap.isAwaitingUser === false &&
      snap.isTimerAdvancing === true &&
      m.getCheckPauseCount() === 2 &&
      m.getStepCameraCheckStatus(true) === 'continued_anyway',
    '9C.4: After 2 check-pauses, camera check is off for the rest of the step and status is "continued_anyway"'
  );
}

// 9D. "Continue anyway" button resumes immediately and records continued_anyway
{
  const m = new OcureExerciseVerificationMachine('head_turn', 30);
  m.start(simClockMs);
  for (let i = 0; i < 30; i++) m.tick(makeNoFaceFrame(100)); // pause via face_lost
  const contSnap = m.continueAnyway(stepClock(100));
  assert(
    contSnap.isAwaitingUser === false &&
      contSnap.isTimerAdvancing === true &&
      contSnap.continuedAnyway === true &&
      m.getStepCameraCheckStatus(true) === 'continued_anyway',
    '9D: continueAnyway() resumes immediately and records cameraCheck: "continued_anyway"'
  );
}

// 9E. 60s awaiting_user timeout sets isAwaitingTimeout = true (to end session as stopped_early)
{
  const m = new OcureExerciseVerificationMachine('blink_complete', 30);
  m.start(simClockMs);
  // Enter face_lost pause (3s)
  let snap = m.tick(makeNoFaceFrame(1000));
  snap = m.tick(makeNoFaceFrame(1000));
  snap = m.tick(makeNoFaceFrame(1000));
  assert(snap.isAwaitingUser === true && snap.isAwaitingTimeout === false, '9E.1: Paused in awaiting_user at 3s');

  // Remain in awaiting_user for 60 seconds
  for (let s = 0; s < 60; s++) {
    snap = m.tick(makeNoFaceFrame(1000));
  }
  assert(
    snap.isAwaitingTimeout === true && snap.awaitingUserSeconds >= 60,
    '9E.2: 60s in awaiting_user triggers isAwaitingTimeout = true so session ends as stopped_early'
  );
}

// 9F. Fail-open checks: tracker warm-up, low confidence, glare/obscured, stale tracker, camera unavailable never pause
{
  // Tracker warm-up
  const mWarm = new OcureExerciseVerificationMachine('blink_complete', 30);
  mWarm.start(simClockMs);
  let snapWarm = mWarm.tick(makeNoFaceFrame(1000, { trackerWarmingUp: true }));
  for (let i = 0; i < 5; i++) {
    snapWarm = mWarm.tick(makeNoFaceFrame(1000, { trackerWarmingUp: true }));
  }
  assert(
    snapWarm.isAwaitingUser === false && snapWarm.isTimerAdvancing === true,
    '9F.1: Tracker warm-up ("No data yet") never triggers a presence pause'
  );

  // Low confidence / glare
  const mLow = new OcureExerciseVerificationMachine('head_turn', 30);
  mLow.start(simClockMs);
  let snapLow = mLow.tick(makeOpenFrame(1000, { isReliable: false, trackingQuality: 'Low' }));
  for (let i = 0; i < 26; i++) {
    snapLow = mLow.tick(makeOpenFrame(1000, { isReliable: false, trackingQuality: 'Low' }));
  }
  assert(
    snapLow.isAwaitingUser === false &&
      snapLow.isTimerAdvancing === true &&
      snapLow.checkPauseCount === 0,
    '9F.2: Low confidence / glare never pauses the session for a missing signal'
  );

  // Camera unavailable / stale
  const mOff = new OcureExerciseVerificationMachine('blink_complete', 30);
  mOff.start(simClockMs);
  let snapOff = mOff.tick(makeNoFaceFrame(1000, { isMonitoring: false, cameraStatus: 'idle' }));
  for (let i = 0; i < 10; i++) {
    snapOff = mOff.tick(makeNoFaceFrame(1000, { isMonitoring: false, cameraStatus: 'idle' }));
  }
  assert(
    snapOff.isAwaitingUser === false &&
      snapOff.statusCaption === 'Camera check: camera unavailable' &&
      mOff.getStepCameraCheckStatus(true) === 'camera_unavailable',
    '9F.3: Camera unavailable never pauses the session and records camera_unavailable'
  );
}

// 9G. Presence-only steps never pause for missing step signal, but DO pause if face is lost for 3s
{
  const mPres = new OcureExerciseVerificationMachine('shoulder_release', 30);
  mPres.start(simClockMs);
  let snapPres = mPres.tick(makeOpenFrame(1000));
  for (let i = 0; i < 28; i++) {
    snapPres = mPres.tick(makeOpenFrame(1000)); // 29s completely still on shoulder_release
  }
  assert(
    snapPres.isAwaitingUser === false &&
      snapPres.reminderCount === 0 &&
      snapPres.checkPauseCount === 0 &&
      snapPres.statusCaption === 'Camera check: presence only' &&
      mPres.getStepCameraCheckStatus(true) === 'presence_only',
    '9G: Presence-only step (shoulder_release) never triggers signal reminders or signal pauses'
  );
}

console.log('\n--- TEST 10: Criterion 16 Monotonic Active-Time Clock (With and Without Pauses) ---');
{
  // Without pauses: 0s -> 30s -> 60s -> 90s -> 120s
  const c0 = computeActiveSessionClock({ startMs: 1000, nowMs: 1000, manualPausedMs: 0, checkPausedMs: 0 });
  const c30 = computeActiveSessionClock({ startMs: 1000, nowMs: 31000, manualPausedMs: 0, checkPausedMs: 0 });
  const c60 = computeActiveSessionClock({ startMs: 1000, nowMs: 61000, manualPausedMs: 0, checkPausedMs: 0 });
  const c90 = computeActiveSessionClock({ startMs: 1000, nowMs: 91000, manualPausedMs: 0, checkPausedMs: 0 });
  const c120 = computeActiveSessionClock({ startMs: 1000, nowMs: 121000, manualPausedMs: 0, checkPausedMs: 0 });
  assert(
    c0.stepIndex === 0 &&
      c30.stepIndex === 1 &&
      c30.segmentFillsPct[0] === 100 &&
      c60.stepIndex === 2 &&
      c60.segmentFillsPct[1] === 100 &&
      c90.stepIndex === 3 &&
      c90.segmentFillsPct[2] === 100 &&
      c120.isComplete === true &&
      c120.segmentFillsPct[3] === 100,
    'Criterion 16a: Without pauses, each segment fills over 30s and routine completes at exactly 120s'
  );

  // With a 10s manual pause and a 15s camera-check pause (25s total paused):
  // At wall time +120s, active time is 95s (step 4, 5s in); completes at wall time +145s (120s active time).
  const cWithPauseAt120Wall = computeActiveSessionClock({
    startMs: 1000,
    nowMs: 121000,
    manualPausedMs: 10000,
    checkPausedMs: 15000,
  });
  const cWithPauseAt145Wall = computeActiveSessionClock({
    startMs: 1000,
    nowMs: 146000,
    manualPausedMs: 10000,
    checkPausedMs: 15000,
  });
  assert(
    cWithPauseAt120Wall.activeElapsedSeconds === 95 &&
      cWithPauseAt120Wall.stepIndex === 3 &&
      cWithPauseAt120Wall.isComplete === false &&
      cWithPauseAt145Wall.activeElapsedSeconds === 120 &&
      cWithPauseAt145Wall.isComplete === true,
    'Criterion 16b: With 10s manual pause + 15s check pause, active clock is 95s at 120s wall time and completes at 145s wall time (120s active)'
  );
}

console.log('\n--- TEST 11: Criterion 17 Start Sequence Timing ---');
{
  const startWithVoice = computeStartSequenceTimings({
    clickStartMs: 0,
    voiceEnabled: true,
    voiceAvailable: true,
    introSpeechDurationMs: 2150,
    speechErrorAtMs: null,
  });
  assert(
    startWithVoice.countdownStartMs === 2150 &&
      startWithVoice.numeral3AtMs === 2150 &&
      startWithVoice.numeral2AtMs === 3150 &&
      startWithVoice.numeral1AtMs === 4150 &&
      startWithVoice.step1StartMs === 5150 &&
      startWithVoice.speechCutOff === false,
    'Criterion 17a: Intro speech (2150ms) finishes completely before countdown ticks 3->2->1 at 1.0s intervals and starts Step 1'
  );

  const startVoiceOff = computeStartSequenceTimings({
    clickStartMs: 0,
    voiceEnabled: false,
    voiceAvailable: true,
    introSpeechDurationMs: 2150,
    speechErrorAtMs: null,
  });
  assert(
    startVoiceOff.countdownStartMs === 0 &&
      startVoiceOff.countdownStartMs <= OCURE_CONFIG.INTRO_MAX_WAIT_SECONDS * 1000 &&
      startVoiceOff.step1StartMs === 3000,
    'Criterion 17b: With Voice off, countdown starts immediately (0ms <= INTRO_MAX_WAIT_SECONDS)'
  );

  const startSpeechErrorOrTimeout = computeStartSequenceTimings({
    clickStartMs: 0,
    voiceEnabled: true,
    voiceAvailable: true,
    speechErrorAtMs: 9000,
  });
  assert(
    startSpeechErrorOrTimeout.countdownStartMs === OCURE_CONFIG.INTRO_MAX_WAIT_SECONDS * 1000,
    'Criterion 17c: Speech error/timeout starts countdown within INTRO_MAX_WAIT_SECONDS (6000ms)'
  );
}

console.log('\n--- TEST 12: Daily Plan, 3-5 Quota, Manual Start Used, Snooze/Decline & Midnight Rollover ---');
const memoryStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in memoryStore ? memoryStore[k] : null),
  setItem: (k: string, v: string) => {
    memoryStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete memoryStore[k];
  },
};

const day1 = new Date(2026, 9, 25, 10, 0, 0);
OcureDailyPlanService.setStoredQuota(3, day1);
assert(OcureDailyPlanService.getDailyPlan(day1).quota === 3, 'Quota can be set to 3 offers/day');
OcureDailyPlanService.setStoredQuota(4, day1);
assert(OcureDailyPlanService.getDailyPlan(day1).quota === 4, 'Quota can be set to 4 offers/day');
OcureDailyPlanService.setStoredQuota(5, day1);
assert(OcureDailyPlanService.getDailyPlan(day1).quota === 5, 'Quota can be set to 5 offers/day');

const noMonOffer = OcureDailyPlanService.evaluateScheduledOffer({
  isMonitoring: false,
  cameraStatus: 'idle',
  activeMonitoredSeconds: 4000,
  latestReliableBand: '10_20',
  now: day1,
});
assert(
  noMonOffer.shouldOffer === false && noMonOffer.reason === 'monitoring_or_active_time_unknown',
  'Criterion 3: No offer when monitoring is off'
);

OcureDailyPlanService.recordManualStart('R2', day1);
const afterManualPlan = OcureDailyPlanService.getDailyPlan(day1);
assert(
  Boolean(afterManualPlan.usedRoutineIds && afterManualPlan.usedRoutineIds.includes('R2')),
  'Criterion 3: Manual start records routine R2 in usedRoutineIds so it is not re-offered today'
);

const firstSnooze = OcureDailyPlanService.snoozeOffer(day1);
const secondSnooze = OcureDailyPlanService.snoozeOffer(day1);
assert(
  firstSnooze === true && secondSnooze === false,
  'Edge case: Offer can be snoozed once (10 min), then second snooze is rejected'
);

for (let b = 1; b <= 5; b++) {
  const res = OcureDailyPlanService.recordSessionCompleted(`R${b}`, 120, `session-day1-${b}`, day1);
  assert(res.recorded === true && res.completedCount === b, `Break ${b} of 5 recorded`);
}
const sixthRes = OcureDailyPlanService.recordSessionCompleted('R6', 120, 'session-day1-6', day1);
assert(
  sixthRes.recorded === false && sixthRes.reason === 'daily_limit_reached',
  '6th break is blocked at daily limit 5'
);

const day2 = new Date(2026, 9, 26, 0, 1, 0);
assert(
  OcureDailyPlanService.getCompletedBreaksTodayCount(day2) === 0 &&
    OcureDailyPlanService.canStartBreakToday(day2) === true,
  'Crossing local midnight resets count to 0 of 5'
);

console.log('\n--- TEST 13: Criterion 15 Wording, Status Line & Clip Files ---');
const ocureScreenSrc = fs.readFileSync('src/components/OcureScreen.tsx', 'utf8');
const ocureServiceSrc = fs.readFileSync('src/services/ocureService.ts', 'utf8');

assert(
  !ocureScreenSrc.includes('Camera Verified') &&
    !ocureScreenSrc.includes('Following step') &&
    !ocureScreenSrc.includes('reps verified') &&
    !ocureScreenSrc.includes('Camera check: verified') &&
    !ocureServiceSrc.includes('Following step') &&
    !ocureServiceSrc.includes('Camera verified'),
  'Criterion 15: Neither OcureScreen.tsx nor ocureService.ts uses "verified" or "Following step" in status labels'
);

assert(
  ocureServiceSrc.includes("Paused: we can't see you") &&
    ocureServiceSrc.includes('Paused: waiting for the step') &&
    ocureScreenSrc.includes('Continue anyway'),
  'Revision 5 Status & Controls: Includes "Paused: we can\'t see you", "Paused: waiting for the step", and "Continue anyway"'
);

for (const entry of Object.values(CLIP_MANIFEST)) {
  const diskPath = `public${entry.file}`;
  assert(
    fs.existsSync(diskPath) && fs.statSync(diskPath).size > 100000,
    `OCURE Clip File Present: ${entry.clipId} -> ${diskPath}`
  );
}

console.log('\n--- TEST 14: Landmark Feature Extractor & Exercise Signal Detection ---');
{
  const fakeLandmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  fakeLandmarks[10] = { x: 0.5, y: 0.28, z: 0 };
  fakeLandmarks[152] = { x: 0.5, y: 0.72, z: 0 };
  fakeLandmarks[33] = { x: 0.35, y: 0.45, z: 0 };
  fakeLandmarks[133] = { x: 0.45, y: 0.45, z: 0 };
  fakeLandmarks[468] = { x: 0.42, y: 0.44, z: 0 };
  fakeLandmarks[159] = { x: 0.40, y: 0.43, z: 0 };
  fakeLandmarks[145] = { x: 0.40, y: 0.47, z: 0 };
  fakeLandmarks[362] = { x: 0.55, y: 0.45, z: 0 };
  fakeLandmarks[263] = { x: 0.65, y: 0.45, z: 0 };
  fakeLandmarks[473] = { x: 0.62, y: 0.44, z: 0 };
  fakeLandmarks[386] = { x: 0.60, y: 0.43, z: 0 };
  fakeLandmarks[374] = { x: 0.60, y: 0.47, z: 0 };
  fakeLandmarks[1] = { x: 0.5, y: 0.52, z: 0 };

  const features = extractExerciseMotionFeatures(fakeLandmarks, {}, { yaw: 2, pitch: -1, roll: 0 });
  assert(
    features.faceObscured === false &&
      features.gazeHorizontal > 0.15 &&
      Math.abs(features.postureY - 0.62) < 0.01,
    `extractExerciseMotionFeatures: Computes local iris gazeHorizontal (${features.gazeHorizontal.toFixed(2)}), postureY (${features.postureY.toFixed(2)}), and faceObscured=false`
  );

  // Verify eye_closure requires CLOSURE_MIN_SECONDS (2.0 s) to record 'detected'
  const mClosure = new OcureExerciseVerificationMachine('eye_closure', 30);
  mClosure.start(simClockMs);
  for (let i = 0; i < 22; i++) {
    mClosure.tick(makeClosedFrame(100)); // 2.2s >= 2.0s
  }
  assert(
    mClosure.getStepCameraCheckStatus(true) === 'detected',
    'eye_closure: Records "detected" once eyes are closed for >= CLOSURE_MIN_SECONDS (2s)'
  );

  // Verify head_turn requires HEAD_TURN_MIN_DEGREES (10 deg) to record 'detected'
  const mHead = new OcureExerciseVerificationMachine('head_turn', 30);
  mHead.start(simClockMs);
  mHead.tick(makeOpenFrame(100, { headYaw: 0 }));
  mHead.tick(makeOpenFrame(100, { headYaw: 12 }));
  assert(
    mHead.getStepCameraCheckStatus(true) === 'detected',
    'head_turn: Records "detected" once head yaw changes by >= HEAD_TURN_MIN_DEGREES (10 deg)'
  );
}

console.log('\n--- TEST 15: Criterion 19 Audio Output Quality, 10ms/20ms/50ms Envelope & Per-Line Instrumentation ---');
{
  const sampleRate = 24000;
  const numSamples = 2400; // 100ms speech body
  const pcmDataBytes = new Uint8Array(numSamples * 2);
  const pcmView = new DataView(pcmDataBytes.buffer);
  for (let i = 0; i < numSamples; i++) {
    let val = Math.round(Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 8000) + 1200;
    if (i >= numSamples - 5) {
      val = 32000; // Simulated end-of-synthesis transient click spike
    }
    pcmView.setInt16(i * 2, val, true);
  }

  const listChunk = new Uint8Array(24);
  listChunk.set([0x4c, 0x49, 0x53, 0x54, 16, 0, 0, 0]);
  for (let i = 8; i < 24; i++) listChunk[i] = 0x7f;

  const wavTotalSize = 12 + 24 + 8 + pcmDataBytes.byteLength + listChunk.byteLength;
  const wavBuf = new Uint8Array(wavTotalSize);
  const wavView = new DataView(wavBuf.buffer);
  wavBuf.set([0x52, 0x49, 0x46, 0x46], 0);
  wavView.setUint32(4, wavTotalSize - 8, true);
  wavBuf.set([0x57, 0x41, 0x56, 0x45], 8);
  wavBuf.set([0x66, 0x6d, 0x74, 0x20], 12);
  wavView.setUint32(16, 16, true);
  wavView.setUint16(20, 1, true);
  wavView.setUint16(22, 1, true);
  wavView.setUint32(24, sampleRate, true);
  wavView.setUint32(28, sampleRate * 2, true);
  wavView.setUint16(32, 2, true);
  wavView.setUint16(34, 16, true);
  wavBuf.set([0x64, 0x61, 0x74, 0x61], 36);
  wavView.setUint32(40, pcmDataBytes.byteLength, true);
  wavBuf.set(pcmDataBytes, 44);
  wavBuf.set(listChunk, 44 + pcmDataBytes.byteLength);

  const extractedPcm = extractPcmBytesFromWavOrRaw(wavBuf);
  assert(
    extractedPcm.byteLength === pcmDataBytes.byteLength,
    `Criterion 19.1: extractPcmBytesFromWavOrRaw extracts exact 'data' subchunk (${extractedPcm.byteLength} bytes) and strips WAV header + trailing LIST metadata`
  );

  const sanitized = sanitizeAndTaperPcmSamples(extractedPcm, sampleRate, {
    isChunk: false,
    targetSampleRate: sampleRate,
  });

  const silenceSamples = Math.floor((OCURE_AUDIO_CONFIG.TRAILING_SILENCE_MS / 1000) * sampleRate); // 1200 samples (50ms)
  assert(
    sanitized.length === numSamples + silenceSamples && silenceSamples === 1200,
    `Criterion 19.2: sanitizeAndTaperPcmSamples appends ${silenceSamples} samples (50ms) of trailing silence`
  );

  const diag = inspectSanitizedBufferEnd(sanitized, sampleRate);
  assert(
    diag.last16SamplesMaxAmplitude === 0 &&
      diag.trailingSilenceMaxAmplitude === 0 &&
      Math.abs(sanitized[0]) === 0 &&
      Math.abs(sanitized[numSamples - 1]) === 0,
    `Criterion 19.3: Per-line end amplitude is exact 0.000000 across the final speech sample and all ${diag.trailingSilenceSamples} trailing silence samples`
  );

  // Verify sample-rate matching when source rate (22050 Hz) differs from AudioContext rate (24000 Hz)
  const resampled = sanitizeAndTaperPcmSamples(extractedPcm, 22050, {
    isChunk: false,
    targetSampleRate: 24000,
  });
  const resampledDiag = inspectSanitizedBufferEnd(resampled, 24000);
  assert(
    resampledDiag.last16SamplesMaxAmplitude === 0 && resampledDiag.trailingSilenceSamples === 1200,
    'Criterion 19.4: Buffer resampled to match AudioContext sampleRate (24000 Hz) ends at exact 0.000000 amplitude'
  );
}

console.log(`\n========================================`);
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
