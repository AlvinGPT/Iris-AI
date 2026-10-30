/**
 * OCURE EXERCISES & ROUTINES DATA MODULE
 * Single source of truth defining the 10 exercises, 6 routines, and clip manifest.
 * Strictly adheres to OCURE_EXERCISES.md, OCURE_MEDIA.md, and OCURE_FUNCTION.md.
 */

export type ExerciseKind =
  | 'blink_specific'
  | 'general_relaxation'
  | 'gentle_movement'
  | 'posture';

export type ShotType =
  | 'idle'
  | 'eyes_closeup'
  | 'face_closeup'
  | 'medium';

export type EvidenceLevel =
  | 'limited (dry-eye populations)'
  | 'plausible relaxation only'
  | 'insufficient evidence'
  | 'general comfort';

export interface ExerciseRecord {
  id: string;
  instructionId: string;
  name: string;
  kind: ExerciseKind;
  shot: ShotType;
  clipId: string;
  caption: string;
  spokenInstruction: string;
  midCue: string; // Visual cue at 15s
  spokenMidCue?: string; // Optional spoken cue at 15s
  transitionSpeech?: string; // Optional transition cue when step finishes
  repeatOnResume: boolean; // Whether full instruction repeats after pause/interruption
  evidenceLevel: EvidenceLevel;
  evidenceNote?: string;
  skippable: boolean;
  defaultDurationSec: number;
}

export interface RoutineStep {
  stepIndex: number; // 1..4
  exerciseId: string;
  durationSeconds: number; // 30s
  skippable: boolean;
  customPacingNote?: string;
  customSpokenInstruction?: string;
}

export interface RoutineRecord {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
  name: string;
  description: string;
  totalDurationSeconds: number; // 120s
  steps: RoutineStep[];
  containsDeliberateBlinking: boolean;
}

export interface ClipManifestEntry {
  clipId: string;
  file: string;
  shot: ShotType;
  durationSeconds: number;
  loop: boolean;
}

export type OcureVoiceDeliveryContext =
  | 'instruction'
  | 'encouragement'
  | 'telemetry'
  | 'camera_warning'
  | 'completion'
  | 'safety';

export interface VoiceCueScript {
  id: string;
  caption: string;
  spokenText: string;
  context: OcureVoiceDeliveryContext;
}

/**
 * Global precautions shown before every session and reachable during it.
 */
export const GLOBAL_PRECAUTIONS =
  'Blink normally. No squeezing. Do not press on your eyes. Keep your head still during eye movements. Stop if you feel pain, dizziness, double vision or visual disturbance.';

export const COMPLETION_CAPTION = 'Break complete.';
export const SKIPPABLE_STEP_CAPTION = 'Skip this step and rest with your eyes open.';

/**
 * Natural human transition phrases for steps 2, 3, and 4 so routines flow conversationally.
 */
export const STEP_TRANSITION_LEAD_INS: Record<number, string> = {
  1: 'Nice work. Next,',
  2: 'Good. Moving on,',
  3: 'Almost there.',
};

/**
 * Session-level spoken scripts for state transitions, camera-check pauses, and safety cues.
 */
export const OCURE_SESSION_VOICE_SCRIPTS: Record<string, VoiceCueScript> = {
  countdown_start: {
    id: 'voice_countdown_start',
    caption: "Let's take a quick two-minute break together.",
    spokenText: "Let's take a quick two-minute break together.",
    context: 'instruction',
  },
  step_transition: {
    id: 'voice_step_transition',
    caption: "Nice work. Let's move on to the next step.",
    spokenText: "Nice work. Let's move on to the next step.",
    context: 'encouragement',
  },
  manual_resume: {
    id: 'voice_manual_resume',
    caption: "Whenever you're ready, let's pick up right where we left off.",
    spokenText: "Whenever you're ready, let's pick up right where we left off.",
    context: 'encouragement',
  },
  camera_pause_presence: {
    id: 'voice_camera_pause_presence',
    caption: "I can't see you. Please move back into view.",
    spokenText: "I can't see you. Please move back into view.",
    context: 'camera_warning',
  },
  camera_signal_reminder: {
    id: 'voice_camera_signal_reminder',
    caption: "Let's keep going.",
    spokenText: "Let's keep going.",
    context: 'camera_warning',
  },
  camera_pause_signal: {
    id: 'voice_camera_pause_signal',
    caption: 'Paused. Do the step to continue.',
    spokenText: 'Paused. Do the step to continue.',
    context: 'camera_warning',
  },
  camera_pause_signal_blink: {
    id: 'voice_camera_pause_signal_blink',
    caption: 'Paused. Do the step to continue.',
    spokenText: 'Paused. Do the step to continue.',
    context: 'camera_warning',
  },
  camera_pause_signal_closure: {
    id: 'voice_camera_pause_signal_closure',
    caption: 'Paused. Do the step to continue.',
    spokenText: 'Paused. Do the step to continue.',
    context: 'camera_warning',
  },
  camera_pause_signal_head_turn: {
    id: 'voice_camera_pause_signal_head_turn',
    caption: 'Paused. Do the step to continue.',
    spokenText: 'Paused. Do the step to continue.',
    context: 'camera_warning',
  },
  camera_resume: {
    id: 'voice_camera_resume',
    caption: "Got it, thank you. Let's keep going.",
    spokenText: "Got it, thank you. Let's keep going.",
    context: 'encouragement',
  },
  routine_complete: {
    id: 'voice_routine_complete',
    caption:
      "Nice work. That's your two-minute break complete. Take a breath, and ease back into your screen when you're ready.",
    spokenText:
      "Nice work. That's your two-minute break complete. Take a breath, and ease back into your screen when you're ready.",
    context: 'completion',
  },
  precautions_summary: {
    id: 'voice_precautions_summary',
    caption:
      'Keep every movement gentle and comfortable. Never squeeze or press on your eyes, and stop right away if anything feels strained or dizzy.',
    spokenText:
      'Keep every movement gentle and comfortable. Never squeeze or press on your eyes, and stop right away if anything feels strained or dizzy.',
    context: 'safety',
  },
  instruct_close_initial: {
    id: 'voice_instruct_close_initial',
    caption: "Let's begin. Gently close your eyes.",
    spokenText: "Let's begin. Gently close your eyes.",
    context: 'instruction',
  },
  instruct_open: {
    id: 'voice_instruct_open',
    caption: 'Good. Now open your eyes.',
    spokenText: 'Good. Now open your eyes.',
    context: 'instruction',
  },
  instruct_close_next: {
    id: 'voice_instruct_close_next',
    caption: "Great. Let's close them again.",
    spokenText: "Great. Let's close them again.",
    context: 'instruction',
  },
  reminder_close: {
    id: 'voice_reminder_close',
    caption: "Whenever you're ready, gently close your eyes.",
    spokenText: "Whenever you're ready, gently close your eyes.",
    context: 'camera_warning',
  },
  reminder_open: {
    id: 'voice_reminder_open',
    caption: 'Now gently open your eyes so we can continue.',
    spokenText: 'Now gently open your eyes so we can continue.',
    context: 'camera_warning',
  },
  camera_unavailable: {
    id: 'voice_camera_unavailable',
    caption:
      'Please keep your face visible in the camera view so I can guide you through this exercise.',
    spokenText:
      'Please keep your face visible in the camera view so I can guide you through this exercise.',
    context: 'camera_warning',
  },
};

export function buildCameraSignalReminderText(exerciseId: string): string {
  const ex = EXERCISES[exerciseId] || EXERCISES.blink_complete;
  return `Let's keep going. ${ex.caption}`;
}

export function buildStepMidNudgeText(exerciseId: string): string {
  const ex = EXERCISES[exerciseId] || EXERCISES.blink_complete;
  return `Keep going. ${ex.midCue}`;
}

export interface LiveTelemetryVoiceInput {
  isMonitoring: boolean;
  faceDetected: boolean;
  avgBlinkRate: number | null;
  observationSeconds: number;
  isCalibrated: boolean;
  avgScreenDistance: number | null;
}

/**
 * Generates a concise, natural, conversational spoken update grounded strictly in fresh live telemetry.
 */
export function buildLiveBlinkRateVoiceUpdate(input: LiveTelemetryVoiceInput): string {
  if (!input.isMonitoring || input.avgBlinkRate === null || input.observationSeconds < 5) {
    return "Camera monitoring isn't active right now, so I don't have a live blink reading yet.";
  }
  const rate = Math.round(input.avgBlinkRate);
  if (rate < 10) {
    return `Your blinking has slowed a little, to around ${rate} blinks a minute. Try a few gentle, natural blinks.`;
  }
  if (rate < 14) {
    return `You're averaging about ${rate} blinks a minute, just a touch below your usual pace. Let your eyes blink softly and naturally.`;
  }
  if (rate <= 22) {
    return `Your blink rate looks comfortable right now at about ${rate} blinks a minute.`;
  }
  return `You're blinking frequently right now, around ${rate} times a minute. Let's focus on resting your eyes gently without any extra blinking.`;
}

export function buildLiveDistanceVoiceUpdate(input: LiveTelemetryVoiceInput): string {
  if (!input.isCalibrated) {
    return "Your screen distance isn't calibrated yet. You can calibrate it anytime from the top bar when you're ready.";
  }
  if (!input.isMonitoring || !input.faceDetected || input.avgScreenDistance === null) {
    return "I can't measure your screen distance right now. Sit comfortably in view of the camera when you're ready.";
  }
  const dist = Math.round(input.avgScreenDistance);
  if (dist < 38) {
    return `You're sitting a little close to the screen, at about ${dist} centimeters. Try easing back slightly so your eyes can relax.`;
  }
  if (dist <= 65) {
    return `You're at a good distance from the screen, right around ${dist} centimeters. Keep that position comfortable.`;
  }
  return `You're about ${dist} centimeters from the screen, which gives your eyes plenty of room.`;
}

export function buildCombinedLiveStatusVoiceUpdate(input: LiveTelemetryVoiceInput): string {
  if (!input.isMonitoring) {
    return "Camera monitoring is currently paused, so live blink rate and screen distance readings aren't active right now.";
  }
  const blinkPart = buildLiveBlinkRateVoiceUpdate(input);
  const distPart = buildLiveDistanceVoiceUpdate(input);
  return `${blinkPart} ${distPart}`;
}

/**
 * 10 Exercise Records defined in OCURE_EXERCISES.md §3
 */
export const EXERCISES: Record<string, ExerciseRecord> = {
  blink_complete: {
    id: 'blink_complete',
    instructionId: 'inst_blink_complete',
    name: 'Gentle complete blinks',
    kind: 'blink_specific',
    shot: 'eyes_closeup',
    clipId: 'eyes_blink_complete',
    caption: 'Blink slowly and fully.',
    spokenInstruction:
      'Start with a few slow, complete blinks. Let your eyelids close all the way down gently, then open back up.',
    midCue: 'Let your eyelids close softly, then open. No squeezing.',
    spokenMidCue: "That's it. Keep each blink soft and unhurried, with no squeezing.",
    repeatOnResume: false,
    evidenceLevel: 'limited (dry-eye populations)',
    evidenceNote: 'Blink practice evidence exists mainly in dry-eye populations over multi-week programs.',
    skippable: false,
    defaultDurationSec: 30,
  },
  eye_closure: {
    id: 'eye_closure',
    instructionId: 'inst_eye_closure',
    name: 'Comfortable eye closure',
    kind: 'general_relaxation',
    shot: 'eyes_closeup',
    clipId: 'eyes_closure_rest',
    caption: 'Close your eyes gently.',
    spokenInstruction:
      'Now, let your eyes close gently. Rest them closed for a few quiet seconds, then open them softly.',
    midCue: 'Rest them closed for a few seconds, then open.',
    spokenMidCue:
      "Keep your eyelids light and relaxed. There's nothing you need to focus on right now.",
    repeatOnResume: false,
    evidenceLevel: 'plausible relaxation only',
    skippable: false,
    defaultDurationSec: 30,
  },
  eyes_horizontal: {
    id: 'eyes_horizontal',
    instructionId: 'inst_eyes_horizontal',
    name: 'Eyes left and right',
    kind: 'gentle_movement',
    shot: 'eyes_closeup',
    clipId: 'eyes_horizontal',
    caption: 'Keep your head still. Look slowly to your left, then to your right.',
    spokenInstruction:
      'Keep your head still and relaxed. Slowly look over to your left, then smoothly across to your right.',
    midCue: 'Stay within a comfortable range.',
    spokenMidCue:
      'Nice and easy. Stay well within a comfortable range, without stretching at the edges.',
    repeatOnResume: false,
    evidenceLevel: 'insufficient evidence',
    skippable: false,
    defaultDurationSec: 30,
  },
  eyes_vertical: {
    id: 'eyes_vertical',
    instructionId: 'inst_eyes_vertical',
    name: 'Eyes up and down',
    kind: 'gentle_movement',
    shot: 'eyes_closeup',
    clipId: 'eyes_vertical',
    caption: 'Keep your head still. Look slowly up, then down.',
    spokenInstruction:
      'Keep your head still. Gently lift your gaze up toward the ceiling, then lower it slowly down.',
    midCue: 'Slow and comfortable.',
    spokenMidCue: 'Keep the movement smooth and unhurried, and let your forehead stay relaxed.',
    repeatOnResume: false,
    evidenceLevel: 'insufficient evidence',
    skippable: false,
    defaultDurationSec: 30,
  },
  eyes_diagonal: {
    id: 'eyes_diagonal',
    instructionId: 'inst_eyes_diagonal',
    name: 'Gentle diagonals',
    kind: 'gentle_movement',
    shot: 'eyes_closeup',
    clipId: 'eyes_diagonal',
    caption: 'Trace short, slow diagonals with your eyes.',
    spokenInstruction:
      'With your head still, trace a short, slow diagonal with your eyes, then pause gently in the center.',
    midCue: 'Never rush or strain.',
    spokenMidCue: 'Take your time with each pass—keep it small, smooth, and strain-free.',
    repeatOnResume: false,
    evidenceLevel: 'insufficient evidence',
    skippable: false,
    defaultDurationSec: 30,
  },
  face_settle: {
    id: 'face_settle',
    instructionId: 'inst_face_settle',
    name: 'Settle and relax your face',
    kind: 'general_relaxation',
    shot: 'face_closeup',
    clipId: 'face_settle_breathing',
    caption: 'Settle in. Soften your forehead and jaw.',
    spokenInstruction:
      'Take a moment to settle in. Let your forehead smooth out, and let your jaw unclench.',
    midCue: 'Blink naturally.',
    spokenMidCue: 'Breathe easily, and just let your eyes blink naturally on their own.',
    repeatOnResume: false,
    evidenceLevel: 'plausible relaxation only',
    skippable: false,
    defaultDurationSec: 30,
  },
  breathing_eyes_open: {
    id: 'breathing_eyes_open',
    instructionId: 'inst_breathing_eyes_open',
    name: 'Relaxed breathing',
    kind: 'general_relaxation',
    shot: 'face_closeup',
    clipId: 'face_settle_breathing',
    caption: 'Breathe slowly. Keep your eyes open and blink naturally.',
    spokenInstruction:
      'Take a slow, comfortable breath in, and let it out. Keep a soft gaze and let yourself blink naturally.',
    midCue: 'Do not try to change how often you blink.',
    spokenMidCue: 'No need to count or force your blinks—just let them happen at their own pace.',
    repeatOnResume: false,
    evidenceLevel: 'plausible relaxation only',
    skippable: false,
    defaultDurationSec: 30,
  },
  shoulder_release: {
    id: 'shoulder_release',
    instructionId: 'inst_shoulder_release',
    name: 'Shoulder release',
    kind: 'posture',
    shot: 'medium',
    clipId: 'shoulder_relax',
    caption: 'Lift your shoulders gently, then let them drop.',
    spokenInstruction:
      'Gently draw your shoulders up slightly, then let them drop all the way down as you exhale.',
    midCue: 'Unclench your jaw.',
    spokenMidCue: 'Let your jaw unclench and feel the tension leave your neck and shoulders.',
    repeatOnResume: false,
    evidenceLevel: 'general comfort',
    evidenceNote: 'General comfort activity. Not an eye exercise.',
    skippable: false,
    defaultDurationSec: 30,
  },
  head_turn: {
    id: 'head_turn',
    instructionId: 'inst_head_turn',
    name: 'Slow head turns',
    kind: 'posture',
    shot: 'medium',
    clipId: 'head_turn_slow',
    caption: 'Turn your head slowly a small distance, left then right.',
    spokenInstruction:
      'Slowly turn your head a small, comfortable distance to the left, then ease back to the right.',
    midCue: 'Let your shoulders drop.',
    spokenMidCue: 'Keep your shoulders heavy and relaxed while your neck moves gently.',
    repeatOnResume: false,
    evidenceLevel: 'general comfort',
    evidenceNote: 'General comfort activity. Not an eye exercise.',
    skippable: false,
    defaultDurationSec: 30,
  },
  quiet_rest: {
    id: 'quiet_rest',
    instructionId: 'inst_quiet_rest',
    name: 'Quiet rest',
    kind: 'general_relaxation',
    shot: 'face_closeup',
    clipId: 'face_settle_breathing',
    caption: 'Rest and breathe comfortably.',
    spokenInstruction:
      'For this last step, simply rest and breathe comfortably. Let your gaze stay soft and effortless.',
    midCue: 'Let your blinking happen on its own.',
    spokenMidCue: 'Stay relaxed for a few more seconds, and let your blinking happen naturally.',
    repeatOnResume: false,
    evidenceLevel: 'plausible relaxation only',
    skippable: false,
    defaultDurationSec: 30,
  },
};

/**
 * 6 Two-minute Routines (120 s each = 4 steps x 30 s) defined in OCURE_EXERCISES.md §4
 */
export const ROUTINES: Record<string, RoutineRecord> = {
  R1: {
    id: 'R1',
    name: 'Relaxed full-blink practice',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: true,
    steps: [
      {
        stepIndex: 1,
        exerciseId: 'blink_complete',
        durationSeconds: 30,
        skippable: false,
        customPacingNote: 'About one blink every 3-4 s',
        customSpokenInstruction:
          "Let's start with slow, complete blinks—about one gentle blink every three or four seconds.",
      },
      { stepIndex: 2, exerciseId: 'eye_closure', durationSeconds: 30, skippable: false },
      { stepIndex: 3, exerciseId: 'eyes_horizontal', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'shoulder_release', durationSeconds: 30, skippable: false },
    ],
  },
  R2: {
    id: 'R2',
    name: 'Gentle blink and eye relaxation',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: true,
    steps: [
      {
        stepIndex: 1,
        exerciseId: 'blink_complete',
        durationSeconds: 30,
        skippable: false,
        customPacingNote: '5-8 soft blinks',
        customSpokenInstruction:
          "Let's start by taking five to eight soft, full blinks at an easy, relaxed pace.",
      },
      { stepIndex: 2, exerciseId: 'eye_closure', durationSeconds: 30, skippable: false },
      { stepIndex: 3, exerciseId: 'eyes_vertical', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'head_turn', durationSeconds: 30, skippable: false },
    ],
  },
  R3: {
    id: 'R3',
    name: 'Neutral eye-and-posture reset',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: false,
    steps: [
      { stepIndex: 1, exerciseId: 'breathing_eyes_open', durationSeconds: 30, skippable: false },
      { stepIndex: 2, exerciseId: 'eyes_diagonal', durationSeconds: 30, skippable: false },
      { stepIndex: 3, exerciseId: 'eye_closure', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'shoulder_release', durationSeconds: 30, skippable: false },
    ],
  },
  R4: {
    id: 'R4',
    name: 'Relaxation, no extra blinking',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: false,
    steps: [
      { stepIndex: 1, exerciseId: 'face_settle', durationSeconds: 30, skippable: false },
      { stepIndex: 2, exerciseId: 'eye_closure', durationSeconds: 30, skippable: false },
      { stepIndex: 3, exerciseId: 'head_turn', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'quiet_rest', durationSeconds: 30, skippable: false },
    ],
  },
  R5: {
    id: 'R5',
    name: 'Neutral relaxation',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: false,
    steps: [
      { stepIndex: 1, exerciseId: 'face_settle', durationSeconds: 30, skippable: false },
      { stepIndex: 2, exerciseId: 'eye_closure', durationSeconds: 30, skippable: false },
      { stepIndex: 3, exerciseId: 'shoulder_release', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'quiet_rest', durationSeconds: 30, skippable: false },
    ],
  },
  R6: {
    id: 'R6',
    name: 'Optional relaxation',
    description: 'A 2-minute break with gentle eye and posture movements.',
    totalDurationSeconds: 120,
    containsDeliberateBlinking: false,
    steps: [
      { stepIndex: 1, exerciseId: 'face_settle', durationSeconds: 30, skippable: false },
      {
        stepIndex: 2,
        exerciseId: 'eye_closure',
        durationSeconds: 30,
        skippable: true,
        customSpokenInstruction:
          "Let's begin. Gently close your eyes and let them rest, then open when prompted.",
      },
      { stepIndex: 3, exerciseId: 'shoulder_release', durationSeconds: 30, skippable: false },
      { stepIndex: 4, exerciseId: 'quiet_rest', durationSeconds: 30, skippable: false },
    ],
  },
};

export const ROUTINE_ORDER: Array<'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'> = [
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'R6',
];

/**
 * Clip Manifest defined in OCURE_MEDIA.md §2
 */
export const CLIP_MANIFEST: Record<string, ClipManifestEntry> = {
  idle_loop: {
    clipId: 'idle_loop',
    file: '/ocure/clips/idle_loop.mp4',
    shot: 'idle',
    durationSeconds: 8,
    loop: true,
  },
  eyes_blink_complete: {
    clipId: 'eyes_blink_complete',
    file: '/ocure/clips/eyes_blink_complete.mp4',
    shot: 'eyes_closeup',
    durationSeconds: 8,
    loop: true,
  },
  eyes_closure_rest: {
    clipId: 'eyes_closure_rest',
    file: '/ocure/clips/eyes_closure_rest.mp4',
    shot: 'eyes_closeup',
    durationSeconds: 8,
    loop: true,
  },
  eyes_horizontal: {
    clipId: 'eyes_horizontal',
    file: '/ocure/clips/eyes_horizontal.mp4',
    shot: 'eyes_closeup',
    durationSeconds: 8,
    loop: true,
  },
  eyes_vertical: {
    clipId: 'eyes_vertical',
    file: '/ocure/clips/eyes_vertical.mp4',
    shot: 'eyes_closeup',
    durationSeconds: 8,
    loop: true,
  },
  eyes_diagonal: {
    clipId: 'eyes_diagonal',
    file: '/ocure/clips/eyes_diagonal.mp4',
    shot: 'eyes_closeup',
    durationSeconds: 8,
    loop: true,
  },
  face_settle_breathing: {
    clipId: 'face_settle_breathing',
    file: '/ocure/clips/face_settle_breathing.mp4',
    shot: 'face_closeup',
    durationSeconds: 8,
    loop: true,
  },
  shoulder_relax: {
    clipId: 'shoulder_relax',
    file: '/ocure/clips/shoulder_relax.mp4',
    shot: 'medium',
    durationSeconds: 8,
    loop: true,
  },
  head_turn_slow: {
    clipId: 'head_turn_slow',
    file: '/ocure/clips/head_turn_slow.mp4',
    shot: 'medium',
    durationSeconds: 8,
    loop: true,
  },
  coach_complete: {
    clipId: 'coach_complete',
    file: '/ocure/clips/coach_complete.mp4',
    shot: 'face_closeup',
    durationSeconds: 8,
    loop: false,
  },
};

export const MASCOT_STILL_FALLBACK = '/ocure/mascot-still.png';

export interface GuidedStepPhaseCue {
  atSec: number;
  spokenText: string;
  caption: string;
  eyeActionState?: 'closed' | 'open';
  completedReps?: number;
  context?: OcureVoiceDeliveryContext;
}

/**
 * Returns timed, step-by-step spoken and visual guidance cues across a 30-second step
 * so OCURE actively guides the user ("Close your eyes", "Open your eyes", "Close your eyes again", etc.).
 */
export function getGuidedCuesForExercise(
  exerciseId: string,
  stepIdx: number = 0
): GuidedStepPhaseCue[] {
  const leadIn = stepIdx > 0 ? `${STEP_TRANSITION_LEAD_INS[stepIdx] || 'Next,'} ` : '';

  switch (exerciseId) {
    case 'blink_complete':
      return [
        {
          atSec: 0,
          spokenText: stepIdx === 0 ? 'Close your eyes.' : `${leadIn}close your eyes.`,
          caption: 'Close your eyes.',
          eyeActionState: 'closed',
          completedReps: 0,
          context: 'instruction',
        },
        {
          atSec: 6,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 12,
          spokenText: 'Close your eyes again.',
          caption: 'Close your eyes again.',
          eyeActionState: 'closed',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 18,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 2,
          context: 'instruction',
        },
        {
          atSec: 23,
          spokenText: 'Close your eyes.',
          caption: 'Close your eyes.',
          eyeActionState: 'closed',
          completedReps: 2,
          context: 'instruction',
        },
        {
          atSec: 27,
          spokenText: 'And open your eyes.',
          caption: 'And open your eyes.',
          eyeActionState: 'open',
          completedReps: 3,
          context: 'encouragement',
        },
      ];

    case 'eye_closure':
      return [
        {
          atSec: 0,
          spokenText:
            stepIdx === 0
              ? 'Gently close your eyes.'
              : `${leadIn}gently close your eyes.`,
          caption: 'Gently close your eyes.',
          eyeActionState: 'closed',
          completedReps: 0,
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 13,
          spokenText: 'Close your eyes again.',
          caption: 'Close your eyes again.',
          eyeActionState: 'closed',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 20,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 2,
          context: 'instruction',
        },
        {
          atSec: 24,
          spokenText: 'Close your eyes.',
          caption: 'Close your eyes.',
          eyeActionState: 'closed',
          completedReps: 2,
          context: 'instruction',
        },
        {
          atSec: 27.5,
          spokenText: 'And open your eyes.',
          caption: 'And open your eyes.',
          eyeActionState: 'open',
          completedReps: 3,
          context: 'encouragement',
        },
      ];

    case 'eyes_horizontal':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}keep your head still, and look slowly to your left.`,
          caption: 'Keep your head still. Look slowly to your left.',
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Now look to your right.',
          caption: 'Now look to your right.',
          context: 'instruction',
        },
        {
          atSec: 14,
          spokenText: 'Look to your left again.',
          caption: 'Look to your left again.',
          context: 'instruction',
        },
        {
          atSec: 21,
          spokenText: 'Now look to your right.',
          caption: 'Now look to your right.',
          context: 'instruction',
        },
        {
          atSec: 26,
          spokenText: 'And bring your gaze back to center.',
          caption: 'Bring your gaze back to center.',
          context: 'encouragement',
        },
      ];

    case 'eyes_vertical':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}keep your head still, and slowly look up.`,
          caption: 'Keep your head still. Slowly look up.',
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Now look down.',
          caption: 'Now look down.',
          context: 'instruction',
        },
        {
          atSec: 14,
          spokenText: 'Look up again.',
          caption: 'Look up again.',
          context: 'instruction',
        },
        {
          atSec: 21,
          spokenText: 'Now look down.',
          caption: 'Now look down.',
          context: 'instruction',
        },
        {
          atSec: 26,
          spokenText: 'And relax your gaze in the center.',
          caption: 'Relax your gaze in the center.',
          context: 'encouragement',
        },
      ];

    case 'eyes_diagonal':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}keep your head still, and look up and to the left.`,
          caption: 'Look up and to the left.',
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Now look down and to the right.',
          caption: 'Now look down and to the right.',
          context: 'instruction',
        },
        {
          atSec: 14,
          spokenText: 'Look up and to the right.',
          caption: 'Look up and to the right.',
          context: 'instruction',
        },
        {
          atSec: 21,
          spokenText: 'Now look down and to the left.',
          caption: 'Now look down and to the left.',
          context: 'instruction',
        },
        {
          atSec: 26,
          spokenText: 'And pause gently in the center.',
          caption: 'Pause gently in the center.',
          context: 'encouragement',
        },
      ];

    case 'shoulder_release':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}gently lift your shoulders up.`,
          caption: 'Gently lift your shoulders up.',
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Now let your shoulders drop down.',
          caption: 'Now let your shoulders drop down.',
          context: 'instruction',
        },
        {
          atSec: 15,
          spokenText: 'Lift your shoulders up again.',
          caption: 'Lift your shoulders up again.',
          context: 'instruction',
        },
        {
          atSec: 22,
          spokenText: 'And let them drop, unclenching your jaw.',
          caption: 'Let them drop and unclench your jaw.',
          context: 'encouragement',
        },
      ];

    case 'head_turn':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}slowly turn your head to the left.`,
          caption: 'Slowly turn your head to the left.',
          context: 'instruction',
        },
        {
          atSec: 8,
          spokenText: 'Now turn your head gently to the right.',
          caption: 'Now turn your head gently to the right.',
          context: 'instruction',
        },
        {
          atSec: 16,
          spokenText: 'Turn slowly to the left again.',
          caption: 'Turn slowly to the left again.',
          context: 'instruction',
        },
        {
          atSec: 23,
          spokenText: 'And turn to the right, then back to center.',
          caption: 'Turn to the right, then back to center.',
          context: 'encouragement',
        },
      ];

    case 'breathing_eyes_open':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}close your eyes and take a slow breath in.`,
          caption: 'Close your eyes and breathe in slowly.',
          eyeActionState: 'closed',
          completedReps: 0,
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Open your eyes and breathe out.',
          caption: 'Open your eyes and breathe out.',
          eyeActionState: 'open',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 15,
          spokenText: 'Close your eyes again and breathe in.',
          caption: 'Close your eyes again and breathe in.',
          eyeActionState: 'closed',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 23,
          spokenText: 'And open your eyes as you breathe out.',
          caption: 'Open your eyes as you breathe out.',
          eyeActionState: 'open',
          completedReps: 2,
          context: 'encouragement',
        },
      ];

    case 'face_settle':
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}close your eyes and soften your forehead.`,
          caption: 'Close your eyes and soften your forehead.',
          eyeActionState: 'closed',
          completedReps: 0,
          context: 'instruction',
        },
        {
          atSec: 7,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 14,
          spokenText: 'Close your eyes again.',
          caption: 'Close your eyes again.',
          eyeActionState: 'closed',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 21,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 2,
          context: 'instruction',
        },
      ];

    case 'quiet_rest':
    default:
      return [
        {
          atSec: 0,
          spokenText: `${leadIn}close your eyes and rest comfortably.`,
          caption: 'Close your eyes and rest comfortably.',
          eyeActionState: 'closed',
          completedReps: 0,
          context: 'instruction',
        },
        {
          atSec: 8,
          spokenText: 'Open your eyes.',
          caption: 'Open your eyes.',
          eyeActionState: 'open',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 15,
          spokenText: 'Close your eyes again.',
          caption: 'Close your eyes again.',
          eyeActionState: 'closed',
          completedReps: 1,
          context: 'instruction',
        },
        {
          atSec: 23,
          spokenText: 'And open your eyes.',
          caption: 'And open your eyes.',
          eyeActionState: 'open',
          completedReps: 2,
          context: 'encouragement',
        },
      ];
  }
}
