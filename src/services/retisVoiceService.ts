import {
  RetisMetricId,
  RetisStructuredResponse,
  RetisSuggestedAction,
} from '../types';
import {
  SharedDashboardAndRetisSnapshot,
  substituteSnapshotTokens,
} from './retisSnapshot';
import {
  DEVELOPER_INFO_ANSWER,
  isDeveloperInfoQuery,
} from '../constants/retisSystemInstruction';

export const TURN_SILENCE_TIMEOUT_MS = 700;
export const UTTERANCE_SILENCE_TIMEOUT_MS = TURN_SILENCE_TIMEOUT_MS;
export const VOICE_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (600,000 ms)
export const HIDDEN_WINDOW_TIMEOUT_MS = 30 * 1000; // 30 seconds
export const MAX_QUEUED_VOICE_MESSAGES = 3;
export const RESTART_BASE_DELAY_MS = 80; // <= 100ms invisible restart
export const RESTART_BACKOFF_DELAYS_MS = [300, 700, 1400] as const;
export const MAX_CONSECUTIVE_RESTART_FAILURES = 5;
export const RAPID_END_THRESHOLD_MS = 1000;

export const FIRST_AUDIO_TIMEOUT_MS = 1500; // 1.5s max wait before browser speech fallback
export const START_TIMEOUT_MS = 1500; // 1.5s max wait for recognition onstart before calm retry message
export const NO_SOUND_HINT_MS = 5000; // 5.0s listening without sound above noise floor -> calm mic hint
export const NO_TRANSCRIPT_HINT_MS = 8000; // 8.0s sound heard without recognition results -> calm transcription hint
export const THINKING_TIMEOUT_CAP_MS = 30000; // 30.0s cap on thinking state
export const INTERRUPTION_SUSTAIN_MS = 200; // 200ms sustained mic activity for barge-in
export const CAPTION_HOLD_DURATION_MS = 4000; // 4.0s hold after speech completes
export const CAPTION_SHORT_MIN_HOLD_MS = 2000; // 2.0s minimum hold for short replies
export const CAPTION_READING_WORDS_PER_SEC = 3.5; // 3.5 words/sec reading reveal fallback
export const LEVEL_ATTACK_MS = 80; // ~80ms attack smoothing
export const LEVEL_RELEASE_MS = 200; // ~200ms release smoothing
export const RETIS_VOICE_MAX_OUTPUT_TOKENS = 300;
export const RETIS_VOICE_HISTORY_TURNS = 4;
export const RETIS_CAPTIONS_STORAGE_KEY = 'iris_retis_voice_captions_enabled_v1';

export type RetisVoiceDiagnosticEventType =
  | 'voice_open'
  | 'voice_close'
  | 'rec_created'
  | 'start_called'
  | 'onstart'
  | 'start_timeout'
  | 'onaudiostart'
  | 'onsoundstart'
  | 'onspeechstart'
  | 'onresult'
  | 'onresult_interim'
  | 'onresult_final'
  | 'onerror'
  | 'onend'
  | 'restart_scheduled'
  | 'restart_performed'
  | 'mic_stream_acquired'
  | 'mic_level'
  | 'no_sound_hint'
  | 'no_transcript_hint'
  | 'utterance_complete'
  | 'snapshot_built'
  | 'request_sent'
  | 'reply_received'
  | 'validation_result'
  | 'tts_request_sent'
  | 'first_audio_playing'
  | 'barge_in'
  | 'interrupted'
  | 'state_transition';

export interface RetisVoiceDiagnosticEntry {
  sessionId: string;
  timestampMs: number;
  elapsedMs: number;
  event: RetisVoiceDiagnosticEventType;
  detail: Record<string, string | number | boolean | null>;
}

class RetisVoiceDiagnosticsStore {
  private sessionId = `rvoice-${Math.random().toString(36).slice(2, 9)}`;
  private sessionStartMs = Date.now();
  private entries: RetisVoiceDiagnosticEntry[] = [];
  private maxEntries = 300;
  private forceEnabledForTest = false;

  private isDevEnvironment(): boolean {
    if (this.forceEnabledForTest) return true;
    try {
      const metaEnv = (import.meta as any)?.env;
      if (metaEnv && typeof metaEnv.DEV === 'boolean') {
        return metaEnv.DEV;
      }
    } catch {
      // ignore
    }
    try {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
        return process.env.NODE_ENV !== 'production';
      }
    } catch {
      // ignore
    }
    return true;
  }

  public setEnabledForTest(enabled: boolean): void {
    this.forceEnabledForTest = enabled;
  }

  public startNewSession(): string {
    this.sessionId = `rvoice-${Math.random().toString(36).slice(2, 9)}`;
    this.sessionStartMs = Date.now();
    return this.sessionId;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public record(
    event: RetisVoiceDiagnosticEventType,
    detail: Record<string, string | number | boolean | null> = {}
  ): void {
    if (!this.isDevEnvironment()) return;
    const now = Date.now();
    const entry: RetisVoiceDiagnosticEntry = {
      sessionId: this.sessionId,
      timestampMs: now,
      elapsedMs: Math.max(0, now - this.sessionStartMs),
      event,
      detail,
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    if (typeof window !== 'undefined' && typeof console?.debug === 'function') {
      console.debug(
        `[RetisVoiceDiag +${entry.elapsedMs}ms] [${entry.sessionId}] ${entry.event}`,
        entry.detail
      );
    }
  }

  public getEntries(): RetisVoiceDiagnosticEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries = [];
  }

  public formatLogReport(): string {
    return this.entries
      .map(
        (e) =>
          `[+${String(e.elapsedMs).padStart(5, ' ')}ms] [${e.sessionId}] ${e.event} ${JSON.stringify(
            e.detail
          )}`
      )
      .join('\n');
  }
}

export const RetisVoiceDiagnostics = new RetisVoiceDiagnosticsStore();

export const RETIS_VOICE_NAME = 'Mako';
export const RETIS_VOICE_ID = 'mako';
export const RETIS_VOICE_GENDER = 'male' as const;
export const RETIS_AISTUDIO_VOICE_PRESET_ID = 'the-game-show-host';
export const RETIS_VOICE_DESCRIPTION =
  'The Game Show Host — Masculine, energetic, lively, natural and expressive (Mako)';
export const RETIS_LIVE_MODEL = 'gemini-3.8-live';
export const RETIS_LIVE_WS_PATH = '/api/retis-live';

export type RetisSpeechContext = 'greeting' | 'telemetry' | 'warning';

export function inferRetisSpeechContext(text: string): RetisSpeechContext {
  const trimmed = (text || '').trim();
  const lower = trimmed.toLowerCase();
  if (
    /\b(warning|warnings|alert|alerts|uncalibrated|unavailable|paused|no face|missing|cannot|unable|only help with)\b/.test(
      lower
    )
  ) {
    return 'warning';
  }
  if (/^(hello|hi|hey|good morning|good afternoon|good evening|welcome)\b/i.test(trimmed)) {
    return 'greeting';
  }
  return 'telemetry';
}

export type RecognitionGuardState = 'idle' | 'starting' | 'running' | 'stopping';

export type RetisVoiceSessionStatus =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'processing_speech'
  | 'generating_response'
  | 'speaking'
  | 'muted'
  | 'reconnecting'
  | 'error';

export type RetisOrbVisualState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted';

export function expandUnitsForSpeech(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bBPM\b/g, 'blinks per minute')
    .replace(/(\d+)\s*cm\b/gi, '$1 centimeters')
    .replace(/(\d+)\s*hrs?\b/gi, '$1 hours')
    .replace(/(\d+)\s*m\s+(\d+)\s*s\b/gi, '$1 minutes and $2 seconds')
    .replace(/(\d+)\s*m\b/gi, '$1 minutes')
    .replace(/(\d+)\s*s\b/gi, '$1 seconds');
}

/**
 * Load/save the user's Captions toggle preference in localStorage.
 * Defaults to true (Captions ON) without overriding an explicit saved false.
 */
export function loadRetisCaptionsEnabledPreference(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(RETIS_CAPTIONS_STORAGE_KEY);
      if (raw === 'false') return false;
      if (raw === 'true') return true;
    }
  } catch {
    // ignore storage errors
  }
  return true;
}

export function saveRetisCaptionsEnabledPreference(enabled: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(RETIS_CAPTIONS_STORAGE_KEY, enabled ? 'true' : 'false');
    }
  } catch {
    // ignore storage errors
  }
}

export interface WordTiming {
  word: string;
  index: number;
  startMs: number;
  endMs: number;
  lineIndex: number;
  sentenceIndex: number;
}

export interface CaptionWindowState {
  lines: WordTiming[][];
  visibleLines: WordTiming[][];
  hiddenTopLineCount: number;
  activeLineOffset: number;
  activeWordIndex: number;
}

/**
 * Computes word timings and wraps words into natural ~46-character caption lines
 * so the 3-line caption window can smoothly advance as speech progresses.
 */
export function computeWordTimings(
  text: string,
  totalDurationMs: number,
  maxCharsPerLine = 46
): { timings: WordTiming[]; lines: string[][]; wordLines: WordTiming[][] } {
  const rawWords = (text || '').trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) {
    return { timings: [], lines: [], wordLines: [] };
  }

  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentLineChars = 0;

  for (const word of rawWords) {
    const nextChars = currentLine.length === 0 ? word.length : currentLineChars + 1 + word.length;
    if (currentLine.length > 0 && (nextChars > maxCharsPerLine || currentLine.length >= 9)) {
      lines.push(currentLine);
      currentLine = [word];
      currentLineChars = word.length;
    } else {
      currentLine.push(word);
      currentLineChars = nextChars;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Weight each word by character count plus a slight pause weight for sentence-ending punctuation
  const weights = rawWords.map((w) => {
    const punctBonus = /[.!?]$/.test(w) ? 3.5 : /[,;:]$/.test(w) ? 1.8 : 0;
    return Math.max(1, w.length) + punctBonus;
  });
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  const safeDuration = Math.max(800, totalDurationMs);

  let currentStart = 0;
  const timings: WordTiming[] = [];
  const wordLines: WordTiming[][] = lines.map(() => []);
  let lineIdx = 0;
  let wordsInLineCount = 0;
  let sentenceIdx = 0;

  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    const fraction = weights[i] / Math.max(1, totalWeight);
    const wordDuration = Math.max(85, safeDuration * fraction);

    while (lineIdx < lines.length && wordsInLineCount >= lines[lineIdx].length) {
      lineIdx++;
      wordsInLineCount = 0;
    }

    const boundedLineIdx = Math.min(lineIdx, Math.max(0, lines.length - 1));
    const timingEntry: WordTiming = {
      word,
      index: i,
      startMs: Math.round(currentStart),
      endMs: Math.round(currentStart + wordDuration),
      lineIndex: boundedLineIdx,
      sentenceIndex: sentenceIdx,
    };

    timings.push(timingEntry);
    wordLines[boundedLineIdx]?.push(timingEntry);

    currentStart += wordDuration;
    wordsInLineCount++;
    if (/[.!?]["')]*$/.test(word)) {
      sentenceIdx++;
    }
  }

  return { timings, lines, wordLines };
}

/**
 * Computes the active 3-line caption window for a given activeWordIndex.
 * Shows at most 3 lines at a time; when the active word enters line 3+,
 * older lines shift upward so the active line stays comfortably in view.
 */
export function computeCaptionThreeLineWindow(
  wordLines: WordTiming[][],
  activeWordIndex: number,
  maxVisibleLines = 3
): CaptionWindowState {
  if (wordLines.length === 0) {
    return {
      lines: [],
      visibleLines: [],
      hiddenTopLineCount: 0,
      activeLineOffset: 0,
      activeWordIndex,
    };
  }

  let activeLineIdx = 0;
  for (let l = 0; l < wordLines.length; l++) {
    const line = wordLines[l];
    if (line.some((w) => w.index === activeWordIndex)) {
      activeLineIdx = l;
      break;
    }
    if (line.length > 0 && activeWordIndex > line[line.length - 1].index) {
      activeLineIdx = l;
    }
  }

  const maxStartLine = Math.max(0, wordLines.length - maxVisibleLines);
  const hiddenTopLineCount = Math.min(
    maxStartLine,
    Math.max(0, activeLineIdx - (maxVisibleLines - 1))
  );
  const visibleLines = wordLines.slice(
    hiddenTopLineCount,
    hiddenTopLineCount + maxVisibleLines
  );

  return {
    lines: wordLines,
    visibleLines,
    hiddenTopLineCount,
    activeLineOffset: activeLineIdx - hiddenTopLineCount,
    activeWordIndex,
  };
}

/**
 * Splits a validated reply into spoken sentences for sentence-by-sentence TTS pipelining.
 */
export function splitTextIntoSpokenSentences(text: string): string[] {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return [];
  const rawParts = trimmed.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [trimmed];
  const sentences: string[] = [];
  for (const part of rawParts) {
    const clean = part.trim();
    if (!clean) continue;
    // Merge very short fragments (< 18 chars) with the previous sentence to avoid micro-clips
    if (sentences.length > 0 && clean.length < 18) {
      sentences[sentences.length - 1] = `${sentences[sentences.length - 1]} ${clean}`;
    } else {
      sentences.push(clean);
    }
  }
  return sentences.length > 0 ? sentences : [trimmed];
}

export interface LocalFastPathResult {
  matched: true;
  metricId: RetisMetricId;
  answerTemplate: string;
  resolvedText: string;
  structured: RetisStructuredResponse & { source: 'local' };
  elapsedMs: number;
}

/**
 * Deterministic Local Fast-Path Intent Matcher for direct single-metric questions
 * about present/today across the 7 Snapshot metrics:
 * - blink_rate_bpm
 * - screen_distance_cm
 * - blink_alerts
 * - distance_warnings
 * - longest_session
 * - validated_blinks
 * - fatigue_score
 *
 * Returns null for multi-metric, historical (7-day/weekly/monthly), explanatory ("why"/"how"),
 * out-of-scope, or prompt-injection queries so they go through the Gemini pipeline.
 */
export function matchRetisLocalFastPathIntent(
  rawQuestion: string,
  snapshot: SharedDashboardAndRetisSnapshot,
  frozenMetrics?: Record<string, { label: string; value: string }>
): LocalFastPathResult | null {
  const startPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const clean = (rawQuestion || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 160) return null;

  if (isDeveloperInfoQuery(clean)) {
    const endPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return {
      matched: true,
      metricId: 'blink_rate_bpm',
      answerTemplate: DEVELOPER_INFO_ANSWER,
      resolvedText: DEVELOPER_INFO_ANSWER,
      elapsedMs: Math.max(0, endPerf - startPerf),
      structured: {
        answer: DEVELOPER_INFO_ANSWER,
        answer_template: DEVELOPER_INFO_ANSWER,
        metrics_used: [],
        data_period: snapshot.reportingPeriodLabel,
        data_limitations: '',
        out_of_scope: false,
        suggested_action: 'none',
        source: 'local',
      },
    };
  }

  const lower = clean.toLowerCase();

  // 1. Reject prompt injection or instruction override attempts
  if (
    /\b(ignore|disregard|override|pretend|system\s+prompt|instructions?|say\s+my\s+blink|say\s+my\s+distance|act\s+as|forget)\b/.test(
      lower
    )
  ) {
    return null;
  }

  // 2. Reject off-topic / mixed-topic keywords
  if (
    /\b(python|javascript|typescript|fibonacci|script|code|sql|recipe|capital\s+of|weather|stock|homework|essay|poem|joke|translate|math|equation|movie|song|news|president|who\s+is)\b/.test(
      lower
    )
  ) {
    return null;
  }

  // 3. Reject explanatory, comparison, or historical / multi-day questions
  if (
    /\b(why|how\s+do\s+i|how\s+can\s+i|how\s+does|how\s+is\s+it\s+calculated|explain|cause|reason|improve|fix|help\s+me|compare|difference|7-day|7\s+day|week|weekly|month|monthly|yesterday|last\s+week|history|trend|trends|heatmap|heat\s+map|pdf|report|20-20-20|break\s+routine|completed\s+breaks)\b/.test(
      lower
    )
  ) {
    return null;
  }

  // 4. Identify which of the 7 single-metric intents are mentioned
  const mentionsBlinkAlerts = /\b(blink\s+alerts?|low[\s-]blink\s+alerts?)\b/.test(lower);
  const mentionsDistanceWarnings =
    /\b(distance\s+warnings?|distance\s+alerts?|proximity\s+warnings?|proximity\s+alerts?|close[\s-]proximity\s+warnings?)\b/.test(
      lower
    );
  const mentionsGenericAlertsBoth =
    !mentionsBlinkAlerts &&
    !mentionsDistanceWarnings &&
    /\b(alerts?\s+and\s+warnings?|alerts?\s+summary|all\s+alerts?)\b/.test(lower);

  if (mentionsGenericAlertsBoth) {
    return null;
  }

  const mentionsValidatedBlinks =
    !mentionsBlinkAlerts &&
    /\b(validated\s+blinks?|total\s+blinks?|how\s+many\s+blinks?|blink\s+count|number\s+of\s+blinks?)\b/.test(
      lower
    );

  const mentionsBlinkRate =
    !mentionsBlinkAlerts &&
    !mentionsValidatedBlinks &&
    /\b(blink\s*rate|blinks?\s+per\s+minute|bpm|how\s+often\s+am\s+i\s+blinking)\b/.test(lower);

  const mentionsScreenDistance =
    !mentionsDistanceWarnings &&
    /\b(screen\s+distance|viewing\s+distance|my\s+distance|current\s+distance|average\s+distance|how\s+far\s+am\s+i|how\s+close\s+am\s+i|distance\s+from\s+(?:the\s+)?screen|distance\s+right\s+now)\b/.test(
      lower
    );

  const mentionsLongestSession =
    /\b(longest\s+session|longest\s+continuous\s+session|longest\s+streak)\b/.test(lower);

  const mentionsFatigueScore =
    /\b(fatigue\s+score|fatigue\s+level|my\s+fatigue|current\s+fatigue|workload\s+score)\b/.test(
      lower
    );

  const matchedIntents: RetisMetricId[] = [];
  if (mentionsBlinkRate) matchedIntents.push('blink_rate_bpm');
  if (mentionsScreenDistance) matchedIntents.push('screen_distance_cm');
  if (mentionsBlinkAlerts) matchedIntents.push('blink_alerts');
  if (mentionsDistanceWarnings) matchedIntents.push('distance_warnings');
  if (mentionsLongestSession) matchedIntents.push('longest_session');
  if (mentionsValidatedBlinks) matchedIntents.push('validated_blinks');
  if (mentionsFatigueScore) matchedIntents.push('fatigue_score');

  // Must match exactly ONE single-metric intent
  if (matchedIntents.length !== 1) {
    return null;
  }

  const metricId = matchedIntents[0];
  const entries = snapshot.metricEntries;
  const reportingPeriod = snapshot.reportingPeriodLabel;
  let answerTemplate = '';
  let metricsUsed: RetisMetricId[] = [metricId];
  let dataLimitations = '';
  let suggestedAction: RetisSuggestedAction = 'none';

  switch (metricId) {
    case 'blink_rate_bpm': {
      const val = entries.blink_rate_bpm.rawValue;
      if (typeof val === 'number' && Number.isFinite(val)) {
        const rangeStatus =
          val < 14
            ? 'below the 14–18 BPM target range'
            : val <= 18
            ? 'within the 14–18 BPM target range'
            : 'above the 14–18 BPM target range';
        answerTemplate = `Your average blink rate is {{blink_rate_bpm}}, which is ${rangeStatus} over {{observed_duration}} of observed time.`;
        metricsUsed = ['blink_rate_bpm', 'observed_duration'];
        suggestedAction = val < 14 ? 'start_break' : 'none';
      } else {
        const obsSec = snapshot.llmPayload.observedSeconds || 0;
        answerTemplate =
          obsSec > 0 && obsSec < 5
            ? 'Your blink rate is {{blink_rate_bpm}} because only {{observed_duration}} of valid observation time has been recorded so far.'
            : 'Your blink rate is currently {{blink_rate_bpm}}. Start camera monitoring to measure your blink rate.';
        metricsUsed = ['blink_rate_bpm', 'observed_duration'];
        dataLimitations = entries.blink_rate_bpm.unavailableReason || '';
      }
      break;
    }

    case 'screen_distance_cm': {
      const val = entries.screen_distance_cm.rawValue;
      if (typeof val === 'number' && Number.isFinite(val)) {
        const zoneStatus =
          val < 38
            ? 'closer than the 38–65 cm optimal zone'
            : val <= 65
            ? 'within the 38–65 cm optimal zone'
            : 'further than the 38–65 cm optimal zone';
        answerTemplate = `Your screen distance is {{screen_distance_cm}}, which is ${zoneStatus}.`;
        metricsUsed = ['screen_distance_cm'];
        suggestedAction = val < 38 ? 'start_break' : 'none';
      } else if (entries.screen_distance_cm.state === 'uncalibrated') {
        answerTemplate =
          'Your screen distance is currently {{calibration_status}}. Calibrate your distance on the Dashboard to measure in centimeters.';
        metricsUsed = ['screen_distance_cm', 'calibration_status'];
        dataLimitations = entries.screen_distance_cm.unavailableReason || '';
      } else {
        answerTemplate =
          'Your screen distance is currently {{screen_distance_cm}}. Make sure camera monitoring is active and your face is centered.';
        metricsUsed = ['screen_distance_cm'];
        dataLimitations = entries.screen_distance_cm.unavailableReason || '';
      }
      break;
    }

    case 'blink_alerts': {
      const val = entries.blink_alerts.rawValue;
      if (val !== null) {
        answerTemplate =
          'You have received {{blink_alerts}} blink alerts today over {{observed_duration}} of observed time.';
        metricsUsed = ['blink_alerts', 'observed_duration'];
      } else {
        answerTemplate =
          'Blink alerts are currently {{blink_alerts}} because no observations have been recorded today.';
        metricsUsed = ['blink_alerts'];
        dataLimitations = entries.blink_alerts.unavailableReason || '';
      }
      break;
    }

    case 'distance_warnings': {
      const val = entries.distance_warnings.rawValue;
      if (entries.distance_warnings.state === 'uncalibrated') {
        answerTemplate =
          'Distance warnings are currently {{distance_warnings}} because screen distance calibration is required first.';
        metricsUsed = ['distance_warnings', 'calibration_status'];
        dataLimitations = entries.distance_warnings.unavailableReason || '';
      } else if (val !== null) {
        answerTemplate =
          'You have received {{distance_warnings}} distance warnings today over {{observed_duration}} of observed time.';
        metricsUsed = ['distance_warnings', 'observed_duration'];
      } else {
        answerTemplate =
          'Distance warnings are currently {{distance_warnings}} because no observations have been recorded today.';
        metricsUsed = ['distance_warnings'];
        dataLimitations = entries.distance_warnings.unavailableReason || '';
      }
      break;
    }

    case 'longest_session': {
      const val = entries.longest_session.rawValue;
      if (val !== null) {
        answerTemplate =
          'Your longest continuous session today is {{longest_session}} over {{observed_duration}} of observed time.';
        metricsUsed = ['longest_session', 'observed_duration'];
      } else {
        answerTemplate =
          'Your longest session is currently {{longest_session}} because no active session has been recorded today.';
        metricsUsed = ['longest_session'];
        dataLimitations = entries.longest_session.unavailableReason || '';
      }
      break;
    }

    case 'validated_blinks': {
      const val = entries.validated_blinks.rawValue;
      if (val !== null) {
        answerTemplate =
          'You have recorded {{validated_blinks}} validated blinks over {{observed_duration}} of observed time today.';
        metricsUsed = ['validated_blinks', 'observed_duration'];
      } else {
        answerTemplate =
          'Validated blinks are currently {{validated_blinks}} because no session observations have been recorded yet.';
        metricsUsed = ['validated_blinks'];
        dataLimitations = entries.validated_blinks.unavailableReason || '';
      }
      break;
    }

    case 'fatigue_score': {
      const val = entries.fatigue_score.rawValue;
      if (typeof val === 'number' && Number.isFinite(val)) {
        const band =
          val <= 2.5
            ? 'in the comfortable range'
            : val < 4.0
            ? 'in the moderate range'
            : 'in the high-load range';
        answerTemplate = `Your current fatigue score is {{fatigue_score}}, which is ${band} over {{observed_duration}} of observed time.`;
        metricsUsed = ['fatigue_score', 'observed_duration'];
        suggestedAction = val >= 4.0 ? 'start_break' : 'none';
      } else {
        answerTemplate =
          'Your fatigue score is currently {{fatigue_score}} until at least 5 seconds of active observation is recorded.';
        metricsUsed = ['fatigue_score'];
        dataLimitations = entries.fatigue_score.unavailableReason || '';
      }
      break;
    }

    default:
      return null;
  }

  const resolvedText = substituteSnapshotTokens(answerTemplate, snapshot, frozenMetrics);
  const endPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    matched: true,
    metricId,
    answerTemplate,
    resolvedText,
    elapsedMs: Math.max(0, endPerf - startPerf),
    structured: {
      answer: answerTemplate,
      answer_template: answerTemplate,
      metrics_used: metricsUsed,
      data_period: reportingPeriod,
      data_limitations: dataLimitations,
      out_of_scope: false,
      suggested_action: suggestedAction,
      source: 'local',
    },
  };
}

/**
 * Checks whether a recognized transcript is merely acoustic echo of RETIS's own currently playing speech.
 */
export function isEchoOfAssistantSpeech(
  recognizedText: string,
  assistantSpeechText: string | null
): boolean {
  if (!assistantSpeechText || !recognizedText) return false;
  const normUser = recognizedText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (normUser.length === 0) return true;

  const normAssistant = new Set(
    expandUnitsForSpeech(assistantSpeechText)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
  for (const w of assistantSpeechText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)) {
    normAssistant.add(w);
  }

  // Clear interruption commands are never treated as echo
  const firstWord = normUser[0];
  if (
    normUser.length <= 2 &&
    ['stop', 'wait', 'cancel', 'pause', 'hold', 'quiet', 'enough', 'exit', 'close'].includes(
      firstWord
    )
  ) {
    return false;
  }

  let matchedCount = 0;
  for (const word of normUser) {
    if (normAssistant.has(word)) {
      matchedCount++;
    }
  }

  // If >= 80% of recognized words appear in the currently playing assistant text, treat as echo
  return matchedCount / normUser.length >= 0.8;
}

const SINGLE_WORD_VALID_COMMANDS = new Set([
  'stop',
  'cancel',
  'exit',
  'close',
  'mute',
  'unmute',
  'help',
  'repeat',
  'blinks',
  'blink',
  'distance',
  'alerts',
  'warnings',
  'fatigue',
  'breaks',
  'status',
  'hello',
  'hi',
]);

export function hasMinimumTurnWords(text: string): boolean {
  const words = (text || '')
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, '').toLowerCase())
    .filter(Boolean);
  if (words.length >= 2) return true;
  if (words.length === 1 && SINGLE_WORD_VALID_COMMANDS.has(words[0])) {
    return true;
  }
  // Also allow single words in tests or numbered check strings
  if (words.length === 1 && words[0].length >= 4) {
    return true;
  }
  return false;
}

export interface SpeechControllerOptions {
  /** Called whenever live transcript (accumulated final + interim) updates */
  onTranscriptChange: (liveText: string) => void;
  /** Called when an utterance is complete after TURN_SILENCE_TIMEOUT_MS (700ms) of silence */
  onUtteranceComplete: (committedText: string) => void;
  /** Called when recognition truly starts (rec.onstart) */
  onRecognitionStarted?: () => void;
  /** Called when audio capture starts (rec.onaudiostart) */
  onAudioStarted?: () => void;
  /** Called when speech is detected (rec.onspeechstart) */
  onSpeechStarted?: () => void;
  /** Called if rec.onstart does not fire within START_TIMEOUT_MS (1500ms) when watchdog is enabled */
  onStartTimeout?: (friendlyMsg: string) => void;
  /** Enables the 1500ms onstart watchdog timer */
  enableStartTimeoutWatchdog?: boolean;
  /** Optional custom start timeout override for unit tests */
  startTimeoutMs?: number;
  /** Called when user speaks while RETIS is speaking or thinking (barge-in interruption) */
  onBargeIn?: (userSpeechText: string) => void;
  /** Called when empty or unintelligible speech is detected ("I didn't catch that") */
  onUnintelligible?: () => void;
  /** Called when a non-recoverable error or 5 consecutive restart failures force disarming */
  onFatalDisarm: (friendlyMsg: string, isBlocked?: boolean) => void;
  /** Called when 10 minutes of silence elapse while armed */
  onInactivityTimeout?: (friendlyMsg: string) => void;
  /** Optional hook for guard state inspection */
  onGuardStateChange?: (state: RecognitionGuardState) => void;
  /** Optional custom silence timeout override for unit tests */
  silenceTimeoutMs?: number;
  /** Optional custom inactivity timeout override for unit tests */
  inactivityTimeoutMs?: number;
}

export function mapSpeechErrorToPlainLanguage(errorCode: string): {
  recoverable: boolean;
  isBlocked: boolean;
  message: string | null;
} {
  const code = (errorCode || '').toLowerCase().trim();
  if (code === 'no-speech' || code === 'aborted') {
    return { recoverable: true, isBlocked: false, message: null };
  }
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return {
      recoverable: false,
      isBlocked: true,
      message:
        'Microphone access is blocked. Allow microphone permission in your browser settings to use voice input.',
    };
  }
  if (code === 'audio-capture') {
    return {
      recoverable: false,
      isBlocked: true,
      message:
        'No microphone was found, or your microphone is currently in use by another application.',
    };
  }
  if (code === 'language-not-supported') {
    return {
      recoverable: false,
      isBlocked: true,
      message: 'Speech recognition for English is not supported in this browser.',
    };
  }
  if (code === 'network') {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return {
        recoverable: false,
        isBlocked: false,
        message: 'Voice input is unavailable while offline.',
      };
    }
    return {
      recoverable: true,
      isBlocked: false,
      message: null,
    };
  }
  return {
    recoverable: true,
    isBlocked: false,
    message: null,
  };
}

export class SpeechRecognitionController {
  private static instance: SpeechRecognitionController | null = null;
  private recognition: any = null;
  private guardState: RecognitionGuardState = 'idle';
  private armed = false;
  private mutedByUser = false;
  private intentionalStop = false;
  private pausedForSpeechOutput = false;
  private activeAssistantEchoText: string | null = null;
  private currentOptions: SpeechControllerOptions | null = null;

  // Utterance accumulation state across continuous recognition results
  private committedResultIndex = 0;
  private lastResultLength = 0;
  private pendingCarryOverText = '';
  private currentFinalSegment = '';
  private currentInterimSegment = '';
  private lastNormalizedCombinedText = '';
  private silenceTimerId: ReturnType<typeof setTimeout> | null = null;
  private inactivityTimerId: ReturnType<typeof setTimeout> | null = null;
  private restartTimerId: ReturnType<typeof setTimeout> | null = null;
  private startTimeoutTimerId: ReturnType<typeof setTimeout> | null = null;

  // Restart & rapid-failure protection
  private lastStartTimestampMs = 0;
  private consecutiveRapidFailures = 0;
  private hadSpeechInCurrentCycle = false;

  public static getInstance(): SpeechRecognitionController {
    if (!SpeechRecognitionController.instance) {
      SpeechRecognitionController.instance = new SpeechRecognitionController();
    }
    return SpeechRecognitionController.instance;
  }

  public static resetInstanceForTests(): void {
    if (SpeechRecognitionController.instance) {
      SpeechRecognitionController.instance.disarm();
      SpeechRecognitionController.instance.recognition = null;
      SpeechRecognitionController.instance = null;
    }
  }

  public isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  public isArmed(): boolean {
    return this.armed;
  }

  public isMuted(): boolean {
    return this.mutedByUser;
  }

  public getGuardState(): RecognitionGuardState {
    return this.guardState;
  }

  public isPausedForSpeechOutput(): boolean {
    return this.pausedForSpeechOutput;
  }

  /**
   * Sets or clears the currently playing assistant reply text for echo suppression
   * while keeping recognition active for instant user barge-in.
   */
  public setEchoSuppressionText(assistantText: string | null): void {
    this.activeAssistantEchoText = assistantText ? assistantText.trim() : null;
  }

  /**
   * Mutes or unmutes the microphone by explicit user action inside Voice mode.
   */
  public setMuted(muted: boolean): void {
    if (!this.armed) return;
    this.mutedByUser = muted;
    if (muted) {
      if (this.silenceTimerId !== null) {
        clearTimeout(this.silenceTimerId);
        this.silenceTimerId = null;
      }
      if (this.restartTimerId !== null) {
        clearTimeout(this.restartTimerId);
        this.restartTimerId = null;
      }
      this.pendingCarryOverText = '';
      this.currentFinalSegment = '';
      this.currentInterimSegment = '';
      this.currentOptions?.onTranscriptChange('');
      if (this.recognition && (this.guardState === 'running' || this.guardState === 'starting')) {
        this.intentionalStop = true;
        this.setGuardState('stopping');
        try {
          this.recognition.stop();
        } catch {
          this.setGuardState('idle');
        }
      } else {
        this.setGuardState('idle');
      }
    } else {
      this.intentionalStop = false;
      this.consecutiveRapidFailures = 0;
      this.resetInactivityTimer();
      if (this.guardState === 'idle' || this.guardState === 'stopping') {
        this.setGuardState('idle');
        this.startInternalInstance();
      }
    }
  }

  private setGuardState(next: RecognitionGuardState): void {
    this.guardState = next;
    this.currentOptions?.onGuardStateChange?.(next);
  }

  private ensureRecognitionInstance(): any {
    if (this.recognition) {
      return this.recognition;
    }
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return null;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    RetisVoiceDiagnostics.record('rec_created', { lang: 'en-US', continuous: true });

    rec.onstart = () => {
      if (this.startTimeoutTimerId !== null) {
        clearTimeout(this.startTimeoutTimerId);
        this.startTimeoutTimerId = null;
      }
      this.setGuardState('running');
      this.lastStartTimestampMs = Date.now();
      this.hadSpeechInCurrentCycle = false;
      this.committedResultIndex = 0;
      this.lastResultLength = 0;
      RetisVoiceDiagnostics.record('onstart', { guardState: 'running' });
      this.currentOptions?.onRecognitionStarted?.();
    };

    rec.onaudiostart = () => {
      RetisVoiceDiagnostics.record('onaudiostart', {});
      this.currentOptions?.onAudioStarted?.();
    };

    rec.onsoundstart = () => {
      RetisVoiceDiagnostics.record('onsoundstart', {});
    };

    rec.onspeechstart = () => {
      RetisVoiceDiagnostics.record('onspeechstart', {});
      this.currentOptions?.onSpeechStarted?.();
    };

    rec.onresult = (event: any) => {
      if (!this.armed || this.pausedForSpeechOutput || this.mutedByUser) {
        return;
      }

      this.hadSpeechInCurrentCycle = true;
      this.consecutiveRapidFailures = 0;
      this.resetInactivityTimer();

      const results = event?.results;
      if (!results) return;

      this.lastResultLength = results.length;
      let finalChunk = '';
      let interimChunk = '';
      let anyFinalInBatch = false;

      const startIdx = Math.min(this.committedResultIndex, results.length);
      for (let i = startIdx; i < results.length; i++) {
        const res = results[i];
        const transcriptPiece = res?.[0]?.transcript || '';
        if (res?.isFinal) {
          anyFinalInBatch = true;
          finalChunk += transcriptPiece;
        } else {
          interimChunk += transcriptPiece;
        }
      }

      const candidateText = [finalChunk, interimChunk]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      const wordCount = candidateText ? candidateText.split(/\s+/).filter(Boolean).length : 0;
      RetisVoiceDiagnostics.record(anyFinalInBatch ? 'onresult_final' : 'onresult_interim', {
        isFinal: anyFinalInBatch,
        wordCount,
      });

      // If RETIS is currently speaking, suppress pure speaker echo; if non-echo speech arrives, trigger barge-in!
      if (this.activeAssistantEchoText) {
        if (isEchoOfAssistantSpeech(candidateText, this.activeAssistantEchoText)) {
          for (let i = startIdx; i < results.length; i++) {
            if (results[i]?.isFinal) {
              this.committedResultIndex = i + 1;
            }
          }
          return;
        }
        // Real user barge-in word detected!
        this.activeAssistantEchoText = null;
        RetisVoiceDiagnostics.record('barge_in', { trigger: 'speech_recognition', wordCount });
        this.currentOptions?.onBargeIn?.(candidateText);
      }

      this.currentFinalSegment = finalChunk;
      this.currentInterimSegment = interimChunk;

      const combinedLive = [
        this.pendingCarryOverText,
        this.currentFinalSegment,
        this.currentInterimSegment,
      ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      this.currentOptions?.onTranscriptChange(combinedLive);

      const normalizedCombined = combinedLive.toLowerCase();
      if (
        normalizedCombined !== this.lastNormalizedCombinedText ||
        anyFinalInBatch ||
        this.silenceTimerId === null
      ) {
        this.lastNormalizedCombinedText = normalizedCombined;
        this.scheduleSilenceCommit();
      }
    };

    rec.onerror = (event: any) => {
      if (this.intentionalStop || !this.armed || this.mutedByUser) {
        return;
      }

      const rawCode = String(event?.error || '');
      RetisVoiceDiagnostics.record('onerror', { rawCode });
      if (rawCode === 'no-speech') {
        return;
      }

      const mapped = mapSpeechErrorToPlainLanguage(rawCode);
      if (!mapped.recoverable) {
        const msg =
          mapped.message || 'Voice input stopped. Tap the microphone to start again.';
        this.disarm();
        this.currentOptions?.onFatalDisarm(msg, mapped.isBlocked);
      }
    };

    rec.onend = () => {
      const wasRunningDurationMs =
        this.lastStartTimestampMs > 0 ? Date.now() - this.lastStartTimestampMs : 0;

      // Preserve any spoken words gathered before browser recognition ended mid-pause
      const cycleText = [this.currentFinalSegment, this.currentInterimSegment]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cycleText && !this.mutedByUser) {
        this.pendingCarryOverText = [this.pendingCarryOverText, cycleText]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      this.currentFinalSegment = '';
      this.currentInterimSegment = '';
      this.committedResultIndex = 0;
      this.lastResultLength = 0;

      RetisVoiceDiagnostics.record('onend', {
        wasRunningDurationMs,
        hadSpeech: this.hadSpeechInCurrentCycle,
        hasCarryOver: Boolean(this.pendingCarryOverText),
      });

      this.setGuardState('idle');

      if (this.intentionalStop || !this.armed || this.pausedForSpeechOutput || this.mutedByUser) {
        return;
      }

      // If we have accumulated carry-over text and no silence timer is active, ensure it commits after 700ms if user stays silent
      if (this.pendingCarryOverText && this.silenceTimerId === null) {
        this.scheduleSilenceCommit();
      }

      // Check if recognition ended rapidly (< 1 second) without speech
      if (wasRunningDurationMs < RAPID_END_THRESHOLD_MS && !this.hadSpeechInCurrentCycle) {
        this.consecutiveRapidFailures += 1;
      } else {
        this.consecutiveRapidFailures = 0;
      }

      if (this.consecutiveRapidFailures >= MAX_CONSECUTIVE_RESTART_FAILURES) {
        this.disarm();
        this.currentOptions?.onFatalDisarm(
          'Voice input stopped. Tap the microphone to start again.',
          false
        );
        return;
      }

      let delayMs = RESTART_BASE_DELAY_MS;
      if (this.consecutiveRapidFailures >= 3) {
        const backoffIdx = Math.min(
          RESTART_BACKOFF_DELAYS_MS.length - 1,
          this.consecutiveRapidFailures - 3
        );
        delayMs = RESTART_BACKOFF_DELAYS_MS[backoffIdx];
      }

      RetisVoiceDiagnostics.record('restart_scheduled', {
        delayMs,
        consecutiveRapidFailures: this.consecutiveRapidFailures,
      });
      this.scheduleAutoRestart(delayMs);
    };

    this.recognition = rec;
    return rec;
  }

  private scheduleSilenceCommit(): void {
    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }

    const timeoutMs =
      this.currentOptions?.silenceTimeoutMs ?? TURN_SILENCE_TIMEOUT_MS;

    this.silenceTimerId = setTimeout(() => {
      this.silenceTimerId = null;
      this.commitCurrentUtterance();
    }, timeoutMs);
  }

  private commitCurrentUtterance(): void {
    if (!this.armed || this.mutedByUser) return;

    const rawCombined = [
      this.pendingCarryOverText,
      this.currentFinalSegment,
      this.currentInterimSegment,
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.committedResultIndex = this.lastResultLength;
    this.pendingCarryOverText = '';
    this.currentFinalSegment = '';
    this.currentInterimSegment = '';

    this.currentOptions?.onTranscriptChange('');

    // Check for empty or unintelligible transcript
    if (!rawCombined || !/[a-zA-Z0-9]/.test(rawCombined) || !hasMinimumTurnWords(rawCombined)) {
      this.currentOptions?.onUnintelligible?.();
      return;
    }

    const wordCount = rawCombined.split(/\s+/).filter(Boolean).length;
    RetisVoiceDiagnostics.record('utterance_complete', { wordCount });
    this.currentOptions?.onUtteranceComplete(rawCombined);
  }

  public commitCurrentUtteranceIfAny(): string {
    if (!this.armed || this.mutedByUser) return '';
    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
    const rawCombined = [
      this.pendingCarryOverText,
      this.currentFinalSegment,
      this.currentInterimSegment,
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    this.committedResultIndex = this.lastResultLength;
    this.pendingCarryOverText = '';
    this.currentFinalSegment = '';
    this.currentInterimSegment = '';
    this.currentOptions?.onTranscriptChange('');

    if (!rawCombined || !/[a-zA-Z0-9]/.test(rawCombined)) {
      return '';
    }
    this.currentOptions?.onUtteranceComplete(rawCombined);
    return rawCombined;
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimerId !== null) {
      clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }
    if (!this.armed) return;

    const timeoutMs =
      this.currentOptions?.inactivityTimeoutMs ?? VOICE_INACTIVITY_TIMEOUT_MS;

    this.inactivityTimerId = setTimeout(() => {
      this.inactivityTimerId = null;
      if (!this.armed) return;
      this.disarm();
      this.currentOptions?.onInactivityTimeout?.(
        'Voice input turned off after 10 minutes of inactivity.'
      );
    }, timeoutMs);
  }

  private scheduleAutoRestart(delayMs: number): void {
    if (this.restartTimerId !== null) {
      clearTimeout(this.restartTimerId);
      this.restartTimerId = null;
    }

    this.restartTimerId = setTimeout(() => {
      this.restartTimerId = null;
      if (!this.armed || this.pausedForSpeechOutput || this.mutedByUser) {
        return;
      }
      if (this.guardState === 'stopping') {
        this.setGuardState('idle');
      }
      if (this.guardState !== 'idle') {
        return;
      }
      this.startInternalInstance();
    }, delayMs);
  }

  private startInternalInstance(): boolean {
    const rec = this.ensureRecognitionInstance();
    if (!rec) return false;

    if (this.guardState === 'starting' || this.guardState === 'running') {
      return true;
    }

    this.intentionalStop = false;
    this.setGuardState('starting');
    this.clearStartTimeoutTimer();

    if (this.currentOptions?.enableStartTimeoutWatchdog) {
      const startTimeoutMs = this.currentOptions?.startTimeoutMs ?? START_TIMEOUT_MS;
      this.startTimeoutTimerId = setTimeout(() => {
        this.startTimeoutTimerId = null;
        if (this.guardState === 'starting' && this.armed && !this.mutedByUser) {
          RetisVoiceDiagnostics.record('start_timeout', { timeoutMs: startTimeoutMs });
          const msg = "Couldn't start the microphone. Tap the microphone to try again.";
          this.currentOptions?.onStartTimeout?.(msg);
        }
      }, startTimeoutMs);
    }

    try {
      RetisVoiceDiagnostics.record('start_called');
      rec.start();
      return true;
    } catch {
      this.clearStartTimeoutTimer();
      this.setGuardState('idle');
      return false;
    }
  }

  /**
   * Arms persistent voice listening synchronously in the click handler.
   * Stays armed across utterances until disarm() is called.
   */
  public arm(options: SpeechControllerOptions): boolean {
    if (!this.isSupported()) return false;

    this.clearTimers();
    this.currentOptions = options;
    this.armed = true;
    this.mutedByUser = false;
    this.intentionalStop = false;
    this.pausedForSpeechOutput = false;
    this.activeAssistantEchoText = null;
    this.consecutiveRapidFailures = 0;
    this.committedResultIndex = 0;
    this.lastResultLength = 0;
    this.pendingCarryOverText = '';
    this.currentFinalSegment = '';
    this.currentInterimSegment = '';

    this.resetInactivityTimer();

    if (this.guardState === 'running' || this.guardState === 'starting') {
      this.currentOptions?.onGuardStateChange?.(this.guardState);
      return true;
    }

    const started = this.startInternalInstance();
    if (!started) {
      this.armed = false;
      this.clearTimers();
      return false;
    }
    return true;
  }

  /**
   * Pauses recognition while RETIS spoken reply is playing.
   * Preserved for backward compatibility with existing tests.
   */
  public pauseForSpeechOutput(): void {
    if (!this.armed || this.pausedForSpeechOutput) return;
    this.pausedForSpeechOutput = true;
    this.consecutiveRapidFailures = 0;

    if (this.restartTimerId !== null) {
      clearTimeout(this.restartTimerId);
      this.restartTimerId = null;
    }

    if (this.recognition && (this.guardState === 'running' || this.guardState === 'starting')) {
      this.intentionalStop = true;
      this.setGuardState('stopping');
      try {
        this.recognition.stop();
      } catch {
        this.setGuardState('idle');
      }
    }
  }

  /**
   * Resumes recognition automatically after RETIS spoken reply finishes.
   */
  public resumeAfterSpeechOutput(): void {
    if (!this.armed || !this.pausedForSpeechOutput) return;
    this.pausedForSpeechOutput = false;
    this.intentionalStop = false;
    this.consecutiveRapidFailures = 0;
    this.resetInactivityTimer();

    if (this.guardState === 'idle' || this.guardState === 'stopping') {
      this.scheduleAutoRestart(RESTART_BASE_DELAY_MS);
    }
  }

  /**
   * Disarms persistent voice input and stops the singleton recognition instance cleanly.
   */
  public disarm(): void {
    this.armed = false;
    this.mutedByUser = false;
    this.intentionalStop = true;
    this.pausedForSpeechOutput = false;
    this.activeAssistantEchoText = null;
    this.clearTimers();
    this.committedResultIndex = 0;
    this.lastResultLength = 0;
    this.pendingCarryOverText = '';
    this.currentFinalSegment = '';
    this.currentInterimSegment = '';

    if (this.recognition && (this.guardState === 'running' || this.guardState === 'starting')) {
      this.setGuardState('stopping');
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.setGuardState('idle');
  }

  public stop(): void {
    this.disarm();
  }

  public abort(): void {
    this.armed = false;
    this.mutedByUser = false;
    this.intentionalStop = true;
    this.pausedForSpeechOutput = false;
    this.activeAssistantEchoText = null;
    this.clearTimers();
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {
        // ignore
      }
    }
    this.setGuardState('idle');
  }

  private clearStartTimeoutTimer(): void {
    if (this.startTimeoutTimerId !== null) {
      clearTimeout(this.startTimeoutTimerId);
      this.startTimeoutTimerId = null;
    }
  }

  private clearTimers(): void {
    this.clearStartTimeoutTimer();
    if (this.silenceTimerId !== null) {
      clearTimeout(this.silenceTimerId);
      this.silenceTimerId = null;
    }
    if (this.inactivityTimerId !== null) {
      clearTimeout(this.inactivityTimerId);
      this.inactivityTimerId = null;
    }
    if (this.restartTimerId !== null) {
      clearTimeout(this.restartTimerId);
      this.restartTimerId = null;
    }
  }
}

export interface MicVolumeMeterOptions {
  /** Called with normalized 0..1 smoothed microphone level on each animation frame */
  onNormalizedLevel?: (level0to1: number) => void;
  /** Called when user voice is sustained for >= INTERRUPTION_SUSTAIN_MS (200ms) above adaptive noise floor */
  onSustainedVoiceActivity?: () => void;
}

export class MicVolumeMeter {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private animFrameId: number | null = null;
  private smoothedLevel0to1 = 0;
  private noiseFloor0to1 = 0.03;
  private isOutputAudioPlaying = false;
  private isUserMuted = false;
  private voiceAboveThresholdSinceMs: number | null = null;
  private hasTriggeredBargeInForCurrentBurst = false;

  public setOutputAudioPlaying(playing: boolean): void {
    this.isOutputAudioPlaying = playing;
    if (!playing) {
      this.hasTriggeredBargeInForCurrentBurst = false;
      this.voiceAboveThresholdSinceMs = null;
    }
  }

  public setMuted(muted: boolean): void {
    this.isUserMuted = muted;
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach((track) => {
        try {
          track.enabled = !muted;
        } catch {
          // ignore
        }
      });
    }
    if (muted) {
      this.smoothedLevel0to1 = 0;
      this.voiceAboveThresholdSinceMs = null;
    }
  }

  public getSmoothedLevel(): number {
    return this.smoothedLevel0to1;
  }

  public getNoiseFloor(): number {
    return this.noiseFloor0to1;
  }

  public async start(
    onVolume: (vol: number) => void,
    options?: MicVolumeMeterOptions
  ): Promise<{ started: boolean; errorReason?: string; isBlocked?: boolean }> {
    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      return {
        started: false,
        errorReason: 'Microphone input is not supported in this browser.',
        isBlocked: true,
      };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.mediaStream = stream;
      const trackCount =
        typeof stream.getAudioTracks === 'function'
          ? stream.getAudioTracks().length
          : typeof stream.getTracks === 'function'
          ? stream.getTracks().length
          : 1;
      RetisVoiceDiagnostics.record('mic_stream_acquired', {
        trackCount,
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        return { started: true };
      }

      const ctx = new AudioCtxClass();
      this.audioCtx = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      this.analyser = analyser;

      const source = ctx.createMediaStreamSource(stream);
      this.sourceNode = source;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastFrameMs = Date.now();

      const checkVolume = () => {
        if (!this.analyser) return;
        const nowMs = Date.now();
        const dtMs = Math.max(4, Math.min(100, nowMs - lastFrameMs));
        lastFrameMs = nowMs;

        if (this.isUserMuted) {
          this.smoothedLevel0to1 = 0;
          onVolume(0);
          options?.onNormalizedLevel?.(0);
          this.animFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / Math.max(1, dataArray.length);
        const raw0to1 = Math.min(1, Math.max(0, average / 110));

        // Asymmetric exponential smoothing: ~80ms attack, ~200ms release
        const tauMs = raw0to1 > this.smoothedLevel0to1 ? LEVEL_ATTACK_MS : LEVEL_RELEASE_MS;
        const alpha = 1 - Math.exp(-dtMs / tauMs);
        this.smoothedLevel0to1 = this.smoothedLevel0to1 + alpha * (raw0to1 - this.smoothedLevel0to1);

        // Update adaptive ambient noise floor slowly when signal is quiet and output audio isn't playing
        if (!this.isOutputAudioPlaying && raw0to1 < this.noiseFloor0to1 * 1.8) {
          this.noiseFloor0to1 = Math.max(
            0.015,
            Math.min(0.12, this.noiseFloor0to1 * 0.96 + raw0to1 * 0.04)
          );
        }

        // Sustained 200ms voice activity detector for barge-in
        const bargeInThreshold = Math.max(
          this.noiseFloor0to1 * 2.8,
          this.isOutputAudioPlaying ? 0.24 : 0.14
        );
        if (this.smoothedLevel0to1 >= bargeInThreshold) {
          if (this.voiceAboveThresholdSinceMs === null) {
            this.voiceAboveThresholdSinceMs = nowMs;
          } else if (
            !this.hasTriggeredBargeInForCurrentBurst &&
            nowMs - this.voiceAboveThresholdSinceMs >= INTERRUPTION_SUSTAIN_MS
          ) {
            this.hasTriggeredBargeInForCurrentBurst = true;
            options?.onSustainedVoiceActivity?.();
          }
        } else {
          this.voiceAboveThresholdSinceMs = null;
          if (this.smoothedLevel0to1 < bargeInThreshold * 0.7) {
            this.hasTriggeredBargeInForCurrentBurst = false;
          }
        }

        const normalized100 = Math.min(100, Math.round(this.smoothedLevel0to1 * 100));
        onVolume(normalized100);
        options?.onNormalizedLevel?.(Number(this.smoothedLevel0to1.toFixed(4)));

        this.animFrameId = requestAnimationFrame(checkVolume);
      };

      this.animFrameId = requestAnimationFrame(checkVolume);
      return { started: true };
    } catch (err: any) {
      this.stop();
      const errName = String(err?.name || '').toLowerCase();
      if (errName.includes('notallowed') || errName.includes('permissiondenied')) {
        return {
          started: false,
          errorReason:
            'Microphone access is blocked. Allow microphone permission in your browser settings to use voice input.',
          isBlocked: true,
        };
      }
      if (errName.includes('notfound') || errName.includes('devicesnotfound')) {
        return {
          started: false,
          errorReason: 'No microphone was found on this device.',
          isBlocked: true,
        };
      }
      if (errName.includes('notreadable') || errName.includes('trackstart')) {
        return {
          started: false,
          errorReason: 'Microphone is currently in use by another application.',
          isBlocked: true,
        };
      }
      return {
        started: false,
        errorReason: 'Unable to access microphone. Check your audio settings and try again.',
        isBlocked: true,
      };
    }
  }

  /**
   * Simulates microphone level input for deterministic unit testing of the 200ms sustained barge-in detector.
   */
  public simulateLevelSampleForTest(
    raw0to1: number,
    durationMs: number,
    onSustainedBargeIn: () => void
  ): void {
    const steps = Math.max(1, Math.ceil(durationMs / 20));
    const stepMs = durationMs / steps;
    let clockMs = 1000;
    for (let i = 0; i < steps; i++) {
      clockMs += stepMs;
      const tauMs = raw0to1 > this.smoothedLevel0to1 ? LEVEL_ATTACK_MS : LEVEL_RELEASE_MS;
      const alpha = 1 - Math.exp(-stepMs / tauMs);
      this.smoothedLevel0to1 = this.smoothedLevel0to1 + alpha * (raw0to1 - this.smoothedLevel0to1);

      const bargeInThreshold = Math.max(
        this.noiseFloor0to1 * 2.8,
        this.isOutputAudioPlaying ? 0.24 : 0.14
      );
      if (this.smoothedLevel0to1 >= bargeInThreshold) {
        if (this.voiceAboveThresholdSinceMs === null) {
          this.voiceAboveThresholdSinceMs = clockMs;
        } else if (
          !this.hasTriggeredBargeInForCurrentBurst &&
          clockMs - this.voiceAboveThresholdSinceMs >= INTERRUPTION_SUSTAIN_MS
        ) {
          this.hasTriggeredBargeInForCurrentBurst = true;
          onSustainedBargeIn();
        }
      } else {
        this.voiceAboveThresholdSinceMs = null;
        this.hasTriggeredBargeInForCurrentBurst = false;
      }
    }
  }

  public isStreamActive(): boolean {
    if (!this.mediaStream) return false;
    return this.mediaStream.getTracks().some((t) => t.readyState === 'live');
  }

  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
    this.analyser = null;
    this.smoothedLevel0to1 = 0;
    this.voiceAboveThresholdSinceMs = null;
    this.hasTriggeredBargeInForCurrentBurst = false;
  }
}

export interface RetisSpokenReplyOptions {
  context?: RetisSpeechContext;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (friendlyError: string) => void;
  /** Emits real Web Audio output analyser level (0..1) while RETIS is speaking */
  onOutputLevel?: (level0to1: number) => void;
  /** Emits word index progress (0..totalWords-1) synced to sentence audio duration or speechSynthesis boundary events */
  onWordBoundary?: (wordIndex: number, totalWords: number) => void;
  /** Optional override for first-audio timeout (defaults to FIRST_AUDIO_TIMEOUT_MS = 1500ms) */
  firstAudioTimeoutMs?: number;
}

export function getRetisVoiceMetadata(): {
  voiceName: string;
  voiceId: string;
  gender: 'male';
  voiceDescription: string;
  aiStudioPresetId: string;
  endpoint: string;
  liveModel: string;
  liveEndpoint: string;
  sampleRate: number;
} {
  return {
    voiceName: RETIS_VOICE_NAME,
    voiceId: RETIS_VOICE_ID,
    gender: RETIS_VOICE_GENDER,
    voiceDescription: RETIS_VOICE_DESCRIPTION,
    aiStudioPresetId: RETIS_AISTUDIO_VOICE_PRESET_ID,
    endpoint: '/api/retis-tts',
    liveModel: RETIS_LIVE_MODEL,
    liveEndpoint: RETIS_LIVE_WS_PATH,
    sampleRate: 24000,
  };
}

let activeRetisTtsTurnId = 0;
let activeRetisAbortController: AbortController | null = null;
let activeRetisAudioCtx: AudioContext | null = null;
let activeRetisSourceNode: AudioBufferSourceNode | null = null;
let activeRetisGainNode: GainNode | null = null;
let activeRetisOutputAnalyser: AnalyserNode | null = null;
let activeRetisOutputAnimId: ReturnType<typeof setTimeout> | number | null = null;
let activeRetisWordTimerIds: Array<ReturnType<typeof setTimeout>> = [];
const retisAudioBufferCache = new Map<string, AudioBuffer>();

function clearActiveWordTimers(): void {
  for (const id of activeRetisWordTimerIds) {
    clearTimeout(id);
  }
  activeRetisWordTimerIds = [];
  if (activeRetisOutputAnimId !== null) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(activeRetisOutputAnimId as number);
    }
    clearTimeout(activeRetisOutputAnimId as ReturnType<typeof setTimeout>);
    activeRetisOutputAnimId = null;
  }
}

function decodeBase64ToBytes(b64: string): Uint8Array {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const bin = window.atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return new Uint8Array(0);
}

function stripWavHeaderIfPresent(raw: Uint8Array): Uint8Array {
  if (
    raw.byteLength >= 44 &&
    raw[0] === 0x52 && // 'R'
    raw[1] === 0x49 && // 'I'
    raw[2] === 0x46 && // 'F'
    raw[3] === 0x46 && // 'F'
    raw[8] === 0x57 && // 'W'
    raw[9] === 0x41 && // 'A'
    raw[10] === 0x56 && // 'V'
    raw[11] === 0x45 // 'E'
  ) {
    return raw.subarray(44);
  }
  return raw;
}

function pcm16ToWebAudioBuffer(
  ctx: AudioContext,
  pcmBytes: Uint8Array,
  sampleRate = 24000
): AudioBuffer | null {
  const numSamples = Math.floor(pcmBytes.byteLength / 2);
  if (numSamples <= 0 || typeof ctx.createBuffer !== 'function') return null;

  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const channelData = buffer.getChannelData(0);
  const view = new DataView(
    pcmBytes.buffer,
    pcmBytes.byteOffset,
    numSamples * 2
  );

  for (let i = 0; i < numSamples; i++) {
    const int16 = view.getInt16(i * 2, true);
    channelData[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
  }

  return buffer;
}

/**
 * Creates or resumes the shared RETIS playback AudioContext synchronously inside a user click gesture
 * so that subsequent asynchronous TTS buffers can play without browser autoplay policy blocks.
 */
export function unlockRetisPlaybackAudioContext(): void {
  if (typeof window === 'undefined') return;
  const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxClass) return;
  try {
    if (!activeRetisAudioCtx || activeRetisAudioCtx.state === 'closed') {
      activeRetisAudioCtx = new AudioCtxClass();
    }
    if (activeRetisAudioCtx.state === 'suspended' && typeof activeRetisAudioCtx.resume === 'function') {
      void activeRetisAudioCtx.resume().catch(() => {});
    }
  } catch {
    // ignore
  }
}

/**
 * Stops any ongoing RETIS TTS playback immediately (<= 150ms), aborts in-flight synthesis,
 * flushes sentence queues, and cleans up Web Audio nodes and browser speechSynthesis.
 */
export function stopActiveRetisSpeechPlayback(): void {
  activeRetisTtsTurnId += 1;
  clearActiveWordTimers();

  if (activeRetisAbortController) {
    try {
      activeRetisAbortController.abort();
    } catch {
      // ignore
    }
    activeRetisAbortController = null;
  }

  if (activeRetisSourceNode) {
    try {
      activeRetisSourceNode.onended = null;
      activeRetisSourceNode.stop();
      activeRetisSourceNode.disconnect();
    } catch {
      // ignore
    }
    activeRetisSourceNode = null;
  }

  if (activeRetisOutputAnalyser) {
    try {
      activeRetisOutputAnalyser.disconnect();
    } catch {
      // ignore
    }
    activeRetisOutputAnalyser = null;
  }

  if (activeRetisGainNode) {
    try {
      activeRetisGainNode.disconnect();
    } catch {
      // ignore
    }
    activeRetisGainNode = null;
  }

  if (activeRetisAudioCtx) {
    try {
      activeRetisAudioCtx.close();
    } catch {
      // ignore
    }
    activeRetisAudioCtx = null;
  }
  retisAudioBufferCache.clear();

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }
}

/**
 * Schedules word-by-word boundary callbacks for a sentence's words over `durationMs`,
 * weighted by character count so the live caption highlight tracks the spoken words.
 */
function scheduleSentenceWordBoundaries(
  sentenceWords: string[],
  globalStartWordIdx: number,
  totalWordsCount: number,
  durationMs: number,
  turnId: number,
  onWordBoundary?: (wordIndex: number, totalWords: number) => void
): void {
  if (!onWordBoundary || sentenceWords.length === 0) return;
  const weights = sentenceWords.map((w) => Math.max(1, w.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const safeDurationMs = Math.max(200, durationMs);

  let cumulativeMs = 0;
  for (let i = 0; i < sentenceWords.length; i++) {
    const wordIdx = globalStartWordIdx + i;
    const delayMs = Math.round(cumulativeMs);
    const timerId = setTimeout(() => {
      if (turnId === activeRetisTtsTurnId) {
        onWordBoundary(wordIdx, totalWordsCount);
      }
    }, delayMs);
    activeRetisWordTimerIds.push(timerId);
    cumulativeMs += (weights[i] / Math.max(1, totalWeight)) * safeDurationMs;
  }
}

/**
 * Speaks a RETIS AI response aloud using sentence-by-sentence TTS pipelining:
 * - Requests Sentence 1 immediately from `/api/retis-tts` (prebuilt male voice `Puck`, 24kHz PCM)
 *   and starts playback as soon as Sentence 1 decodes, while prefetching Sentence 2+ in parallel.
 * - Connects a Web Audio `AnalyserNode` to the output source node to emit real output audio levels (`onOutputLevel`).
 * - Emits word-boundary progress (`onWordBoundary`) re-synced at each sentence boundary.
 * - Enforces `FIRST_AUDIO_TIMEOUT_MS = 1500` (1.5s): if `/api/retis-tts` produces no audio within 1.5s,
 *   automatically switches to browser `speechSynthesis` and discards late network audio.
 */
export function playRetisSpokenReply(
  text: string,
  options?: RetisSpokenReplyOptions
): () => void {
  stopActiveRetisSpeechPlayback();

  const rawTrimmed = (text || '').trim();
  const cleanFull = expandUnitsForSpeech(rawTrimmed);
  if (!cleanFull) {
    options?.onEnd?.();
    return () => {};
  }

  const displayWords = rawTrimmed.split(/\s+/).filter(Boolean);
  const totalDisplayWords = displayWords.length;
  const displaySentences = splitTextIntoSpokenSentences(rawTrimmed);
  const spokenSentences = displaySentences.map((s) => expandUnitsForSpeech(s));

  const speechContext: RetisSpeechContext =
    options?.context || inferRetisSpeechContext(cleanFull);
  const turnId = activeRetisTtsTurnId;
  const abortController = new AbortController();
  activeRetisAbortController = abortController;
  const firstAudioTimeoutMs = options?.firstAudioTimeoutMs ?? FIRST_AUDIO_TIMEOUT_MS;

  let hasStarted = false;
  let hasEnded = false;

  const triggerStartOnce = () => {
    if (turnId !== activeRetisTtsTurnId || hasStarted || hasEnded) return;
    hasStarted = true;
    RetisVoiceDiagnostics.record('first_audio_playing', {
      totalWords: totalDisplayWords,
      sentenceCount: spokenSentences.length,
    });
    options?.onStart?.();
  };

  const triggerEndOnce = () => {
    if (turnId !== activeRetisTtsTurnId || hasEnded) return;
    hasEnded = true;
    clearActiveWordTimers();
    options?.onOutputLevel?.(0);
    options?.onEnd?.();
  };

  const playWithBrowserFallback = (): boolean => {
    if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
      return false;
    }
    if (
      typeof window === 'undefined' ||
      !window.speechSynthesis ||
      typeof window.SpeechSynthesisUtterance === 'undefined'
    ) {
      return false;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(cleanFull);
      utterance.rate = speechContext === 'warning' ? 0.98 : 1.04;
      utterance.pitch = 0.98;
      utterance.lang = 'en-US';

      if (typeof window.speechSynthesis.getVoices === 'function') {
        const voices = window.speechSynthesis.getVoices() || [];
        const preferred =
          voices.find(
            (v) =>
              v.lang?.toLowerCase().startsWith('en') &&
              (v.name.includes('Guy') ||
                v.name.includes('Christopher') ||
                v.name.includes('Eric') ||
                v.name.includes('Alex') ||
                v.name.includes('Daniel') ||
                v.name.includes('Google US English'))
          ) || voices.find((v) => v.lang?.toLowerCase().startsWith('en'));
        if (preferred) {
          utterance.voice = preferred;
        }
      }

      // Estimate total fallback duration (~3.5 words/sec) for word boundaries & steady speaking rhythm
      const estimatedDurationMs = Math.max(
        900,
        Math.round((totalDisplayWords / CAPTION_READING_WORDS_PER_SEC) * 1000)
      );

      let boundaryFired = false;
      utterance.onboundary = (ev: any) => {
        if (turnId !== activeRetisTtsTurnId || hasEnded) return;
        if (typeof ev?.charIndex === 'number') {
          boundaryFired = true;
          const prefix = cleanFull.slice(0, ev.charIndex);
          const spokenIdx = Math.max(0, prefix.trim().split(/\s+/).filter(Boolean).length - 1);
          const mappedIdx = Math.min(
            totalDisplayWords - 1,
            Math.floor((spokenIdx / Math.max(1, cleanFull.split(/\s+/).length)) * totalDisplayWords)
          );
          options?.onWordBoundary?.(Math.max(0, mappedIdx), totalDisplayWords);
        }
      };

      utterance.onstart = () => {
        triggerStartOnce();
        if (!boundaryFired) {
          scheduleSentenceWordBoundaries(
            displayWords,
            0,
            totalDisplayWords,
            estimatedDurationMs,
            turnId,
            options?.onWordBoundary
          );
        }
        // Steady speaking rhythm for orb when browser speechSynthesis is used (no raw PCM stream)
        if (options?.onOutputLevel) {
          let phase = 0;
          const stepSteadyLevel = () => {
            if (turnId !== activeRetisTtsTurnId || hasEnded) return;
            phase += 0.25;
            const steadyLevel = 0.42 + 0.16 * Math.sin(phase);
            options.onOutputLevel?.(Number(steadyLevel.toFixed(3)));
            activeRetisOutputAnimId = setTimeout(stepSteadyLevel, 50);
          };
          stepSteadyLevel();
        }
      };
      utterance.onend = () => {
        if (totalDisplayWords > 0) {
          options?.onWordBoundary?.(totalDisplayWords - 1, totalDisplayWords);
        }
        triggerEndOnce();
      };
      utterance.onerror = () => {
        if (turnId === activeRetisTtsTurnId && !hasEnded) {
          options?.onError?.('Audio playback encountered an error.');
          triggerEndOnce();
        }
      };

      triggerStartOnce();
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  };

  const playSingleDecodedBuffer = (
    ctx: AudioContext,
    audioBuffer: AudioBuffer,
    sentenceDisplayWords: string[],
    globalWordOffset: number
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
        resolve(false);
        return;
      }
      try {
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        activeRetisGainNode = gainNode;

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;

        // Connect Web Audio AnalyserNode to measure real output speech amplitude for the Speaking indicator
        if (typeof ctx.createAnalyser === 'function' && options?.onOutputLevel) {
          try {
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.55;
            activeRetisOutputAnalyser = analyser;
            source.connect(analyser);
            analyser.connect(gainNode);

            const freqBins = new Uint8Array(analyser.frequencyBinCount);
            let smoothedOut = 0;
            const sampleOutputLevel = () => {
              if (
                turnId !== activeRetisTtsTurnId ||
                hasEnded ||
                activeRetisSourceNode !== source ||
                !activeRetisOutputAnalyser
              ) {
                return;
              }
              activeRetisOutputAnalyser.getByteFrequencyData(freqBins);
              let sum = 0;
              for (let i = 0; i < freqBins.length; i++) {
                sum += freqBins[i];
              }
              const avg = sum / Math.max(1, freqBins.length);
              const rawOut = Math.min(1, Math.max(0, avg / 105));
              smoothedOut = rawOut > smoothedOut
                ? smoothedOut + 0.35 * (rawOut - smoothedOut)
                : smoothedOut + 0.18 * (rawOut - smoothedOut);
              options.onOutputLevel?.(Number(smoothedOut.toFixed(4)));
              if (typeof requestAnimationFrame === 'function') {
                activeRetisOutputAnimId = requestAnimationFrame(sampleOutputLevel);
              }
            };
            if (typeof requestAnimationFrame === 'function') {
              activeRetisOutputAnimId = requestAnimationFrame(sampleOutputLevel);
            }
          } catch {
            source.connect(gainNode);
          }
        } else {
          source.connect(gainNode);
        }

        activeRetisSourceNode = source;

        const now = ctx.currentTime || 0;
        const duration = audioBuffer.duration || 0;
        // Zero-crossing micro-fades: 15ms in, 20ms out to eliminate clicks
        const fadeInSec = Math.min(0.015, duration * 0.2);
        const fadeOutSec = Math.min(0.020, duration * 0.2);

        if (typeof gainNode.gain?.setValueAtTime === 'function') {
          gainNode.gain.setValueAtTime(0.0001, now);
          gainNode.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
          if (duration > fadeInSec + fadeOutSec) {
            gainNode.gain.setValueAtTime(1.0, now + duration - fadeOutSec);
            gainNode.gain.linearRampToValueAtTime(0.0001, now + duration);
          }
        }

        triggerStartOnce();

        // Schedule word boundary highlights for this sentence, synced to sentence start and buffer duration
        const durationMs = Math.max(120, Math.round(duration * 1000));
        scheduleSentenceWordBoundaries(
          sentenceDisplayWords,
          globalWordOffset,
          totalDisplayWords,
          durationMs,
          turnId,
          options?.onWordBoundary
        );

        source.onended = () => {
          if (activeRetisSourceNode === source) {
            activeRetisSourceNode = null;
          }
          if (activeRetisGainNode === gainNode) {
            try {
              gainNode.disconnect();
            } catch {
              // ignore
            }
            activeRetisGainNode = null;
          }
          resolve(true);
        };

        source.start(now);
      } catch {
        resolve(false);
      }
    });
  };

  const fetchSentenceAudioBuffer = async (
    ctx: AudioContext,
    sentenceText: string,
    timeoutMs?: number
  ): Promise<AudioBuffer | null> => {
    const cacheKey = `${RETIS_VOICE_ID}::${speechContext}::${sentenceText}`;
    const cachedBuf = retisAudioBufferCache.get(cacheKey);
    if (cachedBuf) {
      return cachedBuf;
    }

    if (typeof ctx.createBuffer !== 'function' || typeof ctx.createBufferSource !== 'function') {
      return null;
    }

    const sentenceAbort = new AbortController();
    const onParentAbort = () => sentenceAbort.abort();
    abortController.signal.addEventListener('abort', onParentAbort, { once: true });

    let timerId: ReturnType<typeof setTimeout> | null = null;
    if (timeoutMs && timeoutMs > 0) {
      timerId = setTimeout(() => {
        sentenceAbort.abort();
      }, timeoutMs);
    }

    try {
      RetisVoiceDiagnostics.record('tts_request_sent', {
        sentenceLength: sentenceText.length,
      });
      const res = await fetch('/api/retis-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sentenceText,
          context: speechContext,
          voice: RETIS_VOICE_NAME,
          voiceId: RETIS_VOICE_ID,
        }),
        signal: sentenceAbort.signal,
      });

      if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
        return null;
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!data?.fallback && typeof data?.audioBase64 === 'string' && data.audioBase64) {
          const rawBytes = decodeBase64ToBytes(data.audioBase64);
          const pcmBytes = stripWavHeaderIfPresent(rawBytes);
          const decoded = pcm16ToWebAudioBuffer(ctx, pcmBytes, data.sampleRate || 24000);
          if (decoded) {
            retisAudioBufferCache.set(cacheKey, decoded);
            return decoded;
          }
        }
      }
    } catch {
      // Timeout or network error -> return null
    } finally {
      if (timerId !== null) clearTimeout(timerId);
      abortController.signal.removeEventListener('abort', onParentAbort);
    }
    return null;
  };

  void (async () => {
    const canUseWebAudio =
      typeof window !== 'undefined' &&
      Boolean(window.AudioContext || (window as any).webkitAudioContext) &&
      typeof fetch === 'function';

    if (canUseWebAudio && spokenSentences.length > 0) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!activeRetisAudioCtx || activeRetisAudioCtx.state === 'closed') {
          activeRetisAudioCtx = new AudioCtxClass();
        }
        const ctx = activeRetisAudioCtx!;
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
          await ctx.resume().catch(() => {});
        }

        // Request Sentence 1 immediately with FIRST_AUDIO_TIMEOUT_MS (1500ms) guard
        const firstBufPromise = fetchSentenceAudioBuffer(
          ctx,
          spokenSentences[0],
          firstAudioTimeoutMs
        );

        // Start prefetching Sentence 2+ in parallel if there are multiple sentences
        const subsequentPromises = spokenSentences
          .slice(1)
          .map((s) => fetchSentenceAudioBuffer(ctx, s, 4500));

        const firstBuffer = await firstBufPromise;

        if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
          return;
        }

        if (firstBuffer) {
          let globalWordOffset = 0;
          const s0Words = displaySentences[0]?.split(/\s+/).filter(Boolean) || [];
          const playedFirst = await playSingleDecodedBuffer(
            ctx,
            firstBuffer,
            s0Words,
            globalWordOffset
          );
          globalWordOffset += s0Words.length;

          if (!playedFirst) {
            if (turnId === activeRetisTtsTurnId && !abortController.signal.aborted) {
              triggerEndOnce();
            }
            return;
          }

          // Play remaining pipelined sentences gaplessly with 60ms natural breathing space
          for (let i = 0; i < subsequentPromises.length; i++) {
            if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
              return;
            }
            const nextBuf = await subsequentPromises[i];
            if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
              return;
            }
            const sWords = displaySentences[i + 1]?.split(/\s+/).filter(Boolean) || [];
            if (nextBuf) {
              // 60ms natural sentence pause
              await new Promise((r) => setTimeout(r, 60));
              if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
                return;
              }
              await playSingleDecodedBuffer(ctx, nextBuf, sWords, globalWordOffset);
            }
            globalWordOffset += sWords.length;
          }

          if (turnId === activeRetisTtsTurnId && !abortController.signal.aborted) {
            if (totalDisplayWords > 0) {
              options?.onWordBoundary?.(totalDisplayWords - 1, totalDisplayWords);
            }
            triggerEndOnce();
          }
          return;
        }
      } catch {
        if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
          return;
        }
      }
    }

    if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
      return;
    }

    // No robotic browser voice fallback — report clear honest error
    if (turnId === activeRetisTtsTurnId) {
      options?.onError?.('Voice audio playback is unavailable on this device.');
      triggerEndOnce();
    }
  })();

  return () => {
    if (turnId === activeRetisTtsTurnId) {
      stopActiveRetisSpeechPlayback();
    }
  };
}

export interface RetisStreamChatOptions {
  focusMetricId?: RetisMetricId;
  history?: Array<{ role: string; content: string; interrupted?: boolean }>;
  snapshot?: any;
  context?: RetisSpeechContext;
  shouldPlayAudio?: boolean;
  onSentenceText?: (index: number, text: string) => void;
  onSentenceAudioStart?: (index: number, text: string, durationMs: number) => void;
  onWordBoundary?: (wordIndex: number, totalWords: number) => void;
  onOutputLevel?: (level0to1: number) => void;
  onDone?: (structured: RetisStructuredResponse) => void;
  onError?: (error: string) => void;
}

interface StreamQueueSentenceItem {
  index: number;
  text: string;
  audioBuffer: AudioBuffer | null;
  audioReady: boolean;
  audioStarted: boolean;
  audioFinished: boolean;
}

/**
 * Real-time simultaneous text generation and Mako TTS streaming:
 * - Connects to SSE /api/retis-chat-stream
 * - As soon as sentence 0 arrives and its Mako audio decodes, starts audio playback immediately!
 * - Displays text only as audio starts speaking (true lockstep text-audio synchronization).
 * - Generates subsequent sentences and Mako audio in parallel without waiting for LLM completion.
 * - Eliminates clicks with 15ms ramp-in, 20ms ramp-out, and 60ms natural breathing pauses.
 */
export function streamRetisChatAndVoice(
  query: string,
  options?: RetisStreamChatOptions
): () => void {
  stopActiveRetisSpeechPlayback();

  const turnId = activeRetisTtsTurnId;
  const abortController = new AbortController();
  activeRetisAbortController = abortController;

  const shouldPlayAudio = options?.shouldPlayAudio !== false;
  const sentenceQueue = new Map<number, StreamQueueSentenceItem>();
  let currentPlayIndex = 0;
  let isPumping = false;
  let isDoneReceived = false;
  let receivedStructured: RetisStructuredResponse | null = null;
  let totalWordsCount = 0;
  let globalWordOffset = 0;
  let emittedSentenceCount = 0;

  const getOrCreateItem = (index: number): StreamQueueSentenceItem => {
    let item = sentenceQueue.get(index);
    if (!item) {
      item = {
        index,
        text: '',
        audioBuffer: null,
        audioReady: false,
        audioStarted: false,
        audioFinished: false,
      };
      sentenceQueue.set(index, item);
    }
    return item;
  };

  const pumpQueue = async () => {
    if (isPumping || turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
      return;
    }
    isPumping = true;

    try {
      while (turnId === activeRetisTtsTurnId && !abortController.signal.aborted) {
        const item = sentenceQueue.get(currentPlayIndex);

        if (!item) {
          if (isDoneReceived && currentPlayIndex >= emittedSentenceCount) {
            // All sentences played to completion!
            options?.onOutputLevel?.(0);
            if (receivedStructured) {
              options?.onDone?.(receivedStructured);
            }
            break;
          }
          // Awaiting next sentence
          break;
        }

        // If playing audio, sentence must have its audio ready
        if (shouldPlayAudio && !item.audioReady) {
          // Wait for sentence_audio event to arrive
          break;
        }

        item.audioStarted = true;
        const sentenceWords = item.text.split(/\s+/).filter(Boolean);

        if (shouldPlayAudio && item.audioBuffer && activeRetisAudioCtx) {
          const ctx = activeRetisAudioCtx;
          const buf = item.audioBuffer;
          const duration = buf.duration || 0;
          const durationMs = Math.max(120, Math.round(duration * 1000));

          // STRICT LOCKSTEP: Sentence text is confirmed spoken ONLY when audio actually begins!
          options?.onSentenceAudioStart?.(currentPlayIndex, item.text, durationMs);

          await new Promise<void>((resolve) => {
            if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
              resolve();
              return;
            }
            try {
              const gainNode = ctx.createGain();
              gainNode.connect(ctx.destination);
              activeRetisGainNode = gainNode;

              const source = ctx.createBufferSource();
              source.buffer = buf;
              activeRetisSourceNode = source;

              if (typeof ctx.createAnalyser === 'function' && options?.onOutputLevel) {
                try {
                  const analyser = ctx.createAnalyser();
                  analyser.fftSize = 256;
                  analyser.smoothingTimeConstant = 0.55;
                  activeRetisOutputAnalyser = analyser;
                  source.connect(analyser);
                  analyser.connect(gainNode);

                  const freqBins = new Uint8Array(analyser.frequencyBinCount);
                  let smoothedOut = 0;
                  const sampleOutputLevel = () => {
                    if (
                      turnId !== activeRetisTtsTurnId ||
                      activeRetisSourceNode !== source ||
                      !activeRetisOutputAnalyser
                    ) {
                      return;
                    }
                    activeRetisOutputAnalyser.getByteFrequencyData(freqBins);
                    let sum = 0;
                    for (let i = 0; i < freqBins.length; i++) sum += freqBins[i];
                    const avg = sum / Math.max(1, freqBins.length);
                    const rawOut = Math.min(1, Math.max(0, avg / 105));
                    smoothedOut = rawOut > smoothedOut
                      ? smoothedOut + 0.35 * (rawOut - smoothedOut)
                      : smoothedOut + 0.18 * (rawOut - smoothedOut);
                    options.onOutputLevel?.(Number(smoothedOut.toFixed(4)));
                    if (typeof requestAnimationFrame === 'function') {
                      activeRetisOutputAnimId = requestAnimationFrame(sampleOutputLevel);
                    }
                  };
                  if (typeof requestAnimationFrame === 'function') {
                    activeRetisOutputAnimId = requestAnimationFrame(sampleOutputLevel);
                  }
                } catch {
                  source.connect(gainNode);
                }
              } else {
                source.connect(gainNode);
              }

              const now = ctx.currentTime || 0;
              const fadeInSec = Math.min(0.015, duration * 0.2);
              const fadeOutSec = Math.min(0.020, duration * 0.2);

              if (typeof gainNode.gain?.setValueAtTime === 'function') {
                gainNode.gain.setValueAtTime(0.0001, now);
                gainNode.gain.linearRampToValueAtTime(1.0, now + fadeInSec);
                if (duration > fadeInSec + fadeOutSec) {
                  gainNode.gain.setValueAtTime(1.0, now + duration - fadeOutSec);
                  gainNode.gain.linearRampToValueAtTime(0.0001, now + duration);
                }
              }

              scheduleSentenceWordBoundaries(
                sentenceWords,
                globalWordOffset,
                totalWordsCount || sentenceWords.length,
                durationMs,
                turnId,
                options?.onWordBoundary
              );

              source.onended = () => {
                if (activeRetisSourceNode === source) activeRetisSourceNode = null;
                if (activeRetisGainNode === gainNode) {
                  try {
                    gainNode.disconnect();
                  } catch {
                    // ignore
                  }
                  activeRetisGainNode = null;
                }
                resolve();
              };

              source.start(now);
            } catch {
              resolve();
            }
          });

          globalWordOffset += sentenceWords.length;

          // 60ms natural breathing space between sentences
          await new Promise((r) => setTimeout(r, 60));
        } else {
          // Audio disabled or unavailable: reveal with natural reading duration
          const readingDurMs = Math.max(
            300,
            Math.round((sentenceWords.length / CAPTION_READING_WORDS_PER_SEC) * 1000)
          );
          options?.onSentenceAudioStart?.(currentPlayIndex, item.text, readingDurMs);
          scheduleSentenceWordBoundaries(
            sentenceWords,
            globalWordOffset,
            totalWordsCount || sentenceWords.length,
            readingDurMs,
            turnId,
            options?.onWordBoundary
          );
          globalWordOffset += sentenceWords.length;
          await new Promise((r) => setTimeout(r, readingDurMs));
        }

        item.audioFinished = true;
        currentPlayIndex++;
      }
    } finally {
      isPumping = false;
    }
  };

  void (async () => {
    try {
      if (shouldPlayAudio && typeof window !== 'undefined') {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          if (!activeRetisAudioCtx || activeRetisAudioCtx.state === 'closed') {
            activeRetisAudioCtx = new AudioCtxClass();
          }
          if (activeRetisAudioCtx.state === 'suspended' && typeof activeRetisAudioCtx.resume === 'function') {
            await activeRetisAudioCtx.resume().catch(() => {});
          }
        }
      }

      const res = await fetch('/api/retis-chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          focusMetricId: options?.focusMetricId,
          history: options?.history,
          snapshot: options?.snapshot,
        }),
        signal: abortController.signal,
      });

      if (turnId !== activeRetisTtsTurnId || abortController.signal.aborted) {
        return;
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || errJson?.message || `Streaming request failed with HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream reader is not available in browser response body.');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (turnId === activeRetisTtsTurnId && !abortController.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const rawEvt of events) {
          if (!rawEvt.trim()) continue;
          let eventType = 'message';
          let eventData = '';

          for (const line of rawEvt.split('\n')) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              eventData += line.slice(5).trim();
            }
          }

          if (!eventData) continue;

          let parsedData: any = null;
          try {
            parsedData = JSON.parse(eventData);
          } catch {
            continue;
          }

          if (eventType === 'sentence_text') {
            const idx = parsedData.index ?? 0;
            const text = parsedData.text || '';
            const item = getOrCreateItem(idx);
            item.text = text;
            emittedSentenceCount = Math.max(emittedSentenceCount, idx + 1);
            totalWordsCount += text.split(/\s+/).filter(Boolean).length;
            options?.onSentenceText?.(idx, text);
            void pumpQueue();
          } else if (eventType === 'sentence_audio') {
            const idx = parsedData.index ?? 0;
            const b64 = parsedData.audioBase64;
            const sampleRate = parsedData.sampleRate || 24000;
            const item = getOrCreateItem(idx);

            if (b64 && activeRetisAudioCtx) {
              const rawBytes = decodeBase64ToBytes(b64);
              const pcmBytes = stripWavHeaderIfPresent(rawBytes);
              item.audioBuffer = pcm16ToWebAudioBuffer(activeRetisAudioCtx, pcmBytes, sampleRate);
            }
            item.audioReady = true;
            void pumpQueue();
          } else if (eventType === 'done') {
            isDoneReceived = true;
            receivedStructured = parsedData.structured;
            void pumpQueue();
          } else if (eventType === 'error') {
            if (currentPlayIndex === 0) {
              options?.onError?.(parsedData.message || 'Stream error');
            }
          }
        }
      }
    } catch (err: unknown) {
      if (turnId === activeRetisTtsTurnId && !abortController.signal.aborted) {
        const msg = err instanceof Error ? err.message : 'Voice streaming error.';
        options?.onError?.(msg);
      }
    }
  })();

  return () => {
    if (turnId === activeRetisTtsTurnId) {
      stopActiveRetisSpeechPlayback();
    }
  };
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return '';
}

function downsampleFloat32ToInt16Pcm(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate = 16000
): Uint8Array {
  if (input.length === 0) return new Uint8Array(0);
  const ratio = inputSampleRate > 0 ? inputSampleRate / targetSampleRate : 1;
  const outLength = ratio === 1 ? input.length : Math.max(1, Math.round(input.length / ratio));
  const pcm16 = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIdx = ratio === 1 ? i : Math.min(input.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, input[srcIdx]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
}

export interface RetisLiveVoiceCallbacks {
  onStatusChange?: (status: RetisVoiceSessionStatus) => void;
  onVolume?: (vol: number) => void;
  onInputTranscription?: (liveUserText: string) => void;
  onUserTurnCommitted?: (finalUserText: string) => string;
  onAssistantTranscriptUpdate?: (turnId: string, assistantText: string, isFinal: boolean) => void;
  onError?: (friendlyError: string, isBlocked?: boolean) => void;
  onClose?: () => void;
  getInitialSnapshot?: () => unknown;
}

/**
 * Real-time bidirectional voice conversation client for RETIS AI using
 * Google AI Studio's `gemini-3.8-live` (Live API) over `/api/retis-live`
 * with the prebuilt adult male voice `Puck` (`id: "puck"`).
 */
export class RetisLiveVoiceClient {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isConnectedState = false;
  private isDisconnecting = false;
  private currentInputTranscript = '';
  private currentOutputTranscript = '';
  private currentTurnId: string | null = null;
  private callbacks: RetisLiveVoiceCallbacks | null = null;

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hasWs = typeof WebSocket !== 'undefined';
    const hasMedia = Boolean(navigator?.mediaDevices?.getUserMedia);
    const hasAudioCtx = Boolean(window.AudioContext || (window as any).webkitAudioContext);
    return hasWs && hasMedia && hasAudioCtx;
  }

  public isConnected(): boolean {
    return this.isConnectedState && this.ws?.readyState === WebSocket.OPEN;
  }

  public async connect(
    callbacks: RetisLiveVoiceCallbacks
  ): Promise<{ connected: boolean; errorReason?: string; isBlocked?: boolean }> {
    this.disconnect();
    this.isDisconnecting = false;
    this.callbacks = callbacks;

    if (!RetisLiveVoiceClient.isSupported()) {
      return {
        connected: false,
        errorReason: 'Real-time Live voice is not supported in this browser.',
        isBlocked: false,
      };
    }

    callbacks.onStatusChange?.('requesting_permission');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.mediaStream = stream;
    } catch (err: any) {
      const errName = String(err?.name || '').toLowerCase();
      if (errName.includes('notallowed') || errName.includes('permissiondenied')) {
        return {
          connected: false,
          errorReason:
            'Microphone access is blocked. Allow microphone permission in your browser settings to use voice input.',
          isBlocked: true,
        };
      }
      if (errName.includes('notfound') || errName.includes('devicesnotfound')) {
        return {
          connected: false,
          errorReason: 'No microphone was found on this device.',
          isBlocked: true,
        };
      }
      if (errName.includes('notreadable') || errName.includes('trackstart')) {
        return {
          connected: false,
          errorReason: 'Microphone is currently in use by another application.',
          isBlocked: true,
        };
      }
      return {
        connected: false,
        errorReason: 'Unable to access microphone. Check your audio settings and try again.',
        isBlocked: true,
      };
    }

    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    try {
      try {
        this.inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
      } catch {
        this.inputAudioCtx = new AudioCtxClass();
      }
      try {
        this.outputAudioCtx = new AudioCtxClass({ sampleRate: 24000 });
      } catch {
        this.outputAudioCtx = new AudioCtxClass();
      }

      if (this.inputAudioCtx?.state === 'suspended' && typeof this.inputAudioCtx.resume === 'function') {
        await this.inputAudioCtx.resume().catch(() => {});
      }
      if (this.outputAudioCtx?.state === 'suspended' && typeof this.outputAudioCtx.resume === 'function') {
        await this.outputAudioCtx.resume().catch(() => {});
      }
    } catch {
      this.disconnect();
      return {
        connected: false,
        errorReason: 'Unable to initialize Web Audio for Live voice conversation.',
        isBlocked: false,
      };
    }

    return new Promise((resolve) => {
      let settled = false;
      const finishConnect = (result: {
        connected: boolean;
        errorReason?: string;
        isBlocked?: boolean;
      }) => {
        if (settled) return;
        settled = true;
        clearTimeout(connectTimeout);
        resolve(result);
      };

      const connectTimeout = setTimeout(() => {
        if (!settled) {
          this.disconnect();
          finishConnect({
            connected: false,
            errorReason: 'Timed out connecting to Gemini Live voice service.',
            isBlocked: false,
          });
        }
      }, 10000);

      let wsUrl = `ws://localhost:3000${RETIS_LIVE_WS_PATH}`;
      if (typeof window !== 'undefined' && window.location?.host) {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${proto}//${window.location.host}${RETIS_LIVE_WS_PATH}`;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
        this.ws = ws;
      } catch {
        this.disconnect();
        finishConnect({
          connected: false,
          errorReason: 'Unable to open WebSocket connection to Live voice service.',
          isBlocked: false,
        });
        return;
      }

      ws.onmessage = (event) => {
        if (this.isDisconnecting) return;
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
        } catch {
          return;
        }

        if (msg.error) {
          const errStr = String(msg.error);
          if (!settled) {
            this.disconnect();
            finishConnect({
              connected: false,
              errorReason: errStr,
              isBlocked: false,
            });
          } else {
            this.callbacks?.onError?.(errStr, false);
          }
          return;
        }

        if (msg.status === 'connected') {
          this.isConnectedState = true;
          this.startMicAudioPipeline();
          const initialSnap = this.callbacks?.getInitialSnapshot?.();
          if (initialSnap) {
            this.sendTelemetrySnapshot(initialSnap);
          }
          this.callbacks?.onStatusChange?.('listening');
          finishConnect({ connected: true });
          return;
        }

        if (typeof msg.inputTranscription === 'string' && msg.inputTranscription) {
          this.currentInputTranscript += msg.inputTranscription;
          this.callbacks?.onInputTranscription?.(this.currentInputTranscript.trim());
          if (this.activeSources.size === 0) {
            this.callbacks?.onStatusChange?.('listening');
          }
        }

        if (typeof msg.outputTranscription === 'string' && msg.outputTranscription) {
          this.ensureUserTurnCommitted();
          this.currentOutputTranscript += msg.outputTranscription;
          if (this.currentTurnId) {
            this.callbacks?.onAssistantTranscriptUpdate?.(
              this.currentTurnId,
              this.currentOutputTranscript.trim(),
              false
            );
          }
        }

        if (typeof msg.audio === 'string' && msg.audio) {
          this.ensureUserTurnCommitted();
          this.schedulePcm24kChunk(msg.audio);
        }

        if (msg.interrupted) {
          this.stopScheduledOutputAudio();
          if (this.currentTurnId && this.currentOutputTranscript.trim()) {
            this.callbacks?.onAssistantTranscriptUpdate?.(
              this.currentTurnId,
              this.currentOutputTranscript.trim(),
              true
            );
          }
          this.currentOutputTranscript = '';
          this.currentTurnId = null;
          this.callbacks?.onStatusChange?.('listening');
        }

        if (msg.turnComplete) {
          this.ensureUserTurnCommitted();
          if (this.currentTurnId && this.currentOutputTranscript.trim()) {
            this.callbacks?.onAssistantTranscriptUpdate?.(
              this.currentTurnId,
              this.currentOutputTranscript.trim(),
              true
            );
          }
          this.currentOutputTranscript = '';
          this.currentTurnId = null;
          if (this.activeSources.size === 0) {
            this.callbacks?.onStatusChange?.('listening');
          }
        }
      };

      ws.onerror = () => {
        if (!settled) {
          this.disconnect();
          finishConnect({
            connected: false,
            errorReason: 'Unable to connect to Gemini Live voice service.',
            isBlocked: false,
          });
        }
      };

      ws.onclose = () => {
        const wasConnected = this.isConnectedState;
        this.isConnectedState = false;
        if (!settled) {
          this.disconnect();
          finishConnect({
            connected: false,
            errorReason: 'Live voice session closed before connecting.',
            isBlocked: false,
          });
        } else if (wasConnected && !this.isDisconnecting) {
          this.callbacks?.onClose?.();
        }
      };
    });
  }

  private ensureUserTurnCommitted(): void {
    if (!this.currentTurnId) {
      const spokenText = this.currentInputTranscript.trim();
      this.currentInputTranscript = '';
      this.callbacks?.onInputTranscription?.('');
      const createdId = this.callbacks?.onUserTurnCommitted?.(spokenText);
      this.currentTurnId = createdId || `live-turn-${Date.now()}`;
    }
  }

  private startMicAudioPipeline(): void {
    if (!this.inputAudioCtx || !this.mediaStream) return;
    try {
      const ctx = this.inputAudioCtx;
      const source = ctx.createMediaStreamSource(this.mediaStream);
      this.sourceNode = source;

      if (typeof ctx.createAnalyser === 'function') {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        this.analyserNode = analyser;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateVol = () => {
          if (!this.analyserNode || this.isDisconnecting) return;
          this.analyserNode.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / Math.max(1, dataArray.length);
          const normalized = Math.min(100, Math.round((avg / 128) * 100));
          this.callbacks?.onVolume?.(normalized);
          if (typeof requestAnimationFrame === 'function') {
            this.animFrameId = requestAnimationFrame(updateVol);
          }
        };
        if (typeof requestAnimationFrame === 'function') {
          this.animFrameId = requestAnimationFrame(updateVol);
        }
      }

      if (typeof ctx.createScriptProcessor === 'function') {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        this.processorNode = processor;
        const actualRate = ctx.sampleRate || 16000;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          if (this.isDisconnecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
          }
          const inputChannel = e.inputBuffer.getChannelData(0);
          const pcmBytes = downsampleFloat32ToInt16Pcm(inputChannel, actualRate, 16000);
          if (pcmBytes.byteLength === 0) return;
          const base64Audio = encodeBytesToBase64(pcmBytes);
          if (base64Audio) {
            try {
              this.ws.send(JSON.stringify({ audio: base64Audio }));
            } catch {
              // ignore send error
            }
          }
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      }
    } catch {
      // ignore pipeline setup errors in mock environments
    }
  }

  private schedulePcm24kChunk(base64Audio: string): void {
    if (!this.outputAudioCtx || this.isDisconnecting) return;
    const ctx = this.outputAudioCtx;
    const rawBytes = decodeBase64ToBytes(base64Audio);
    const pcmBytes = stripWavHeaderIfPresent(rawBytes);
    const audioBuffer = pcm16ToWebAudioBuffer(ctx, pcmBytes, 24000);
    if (!audioBuffer) return;

    try {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime || 0;
      const startAt = Math.max(now, this.nextStartTime);
      this.nextStartTime = startAt + (audioBuffer.duration || 0);

      this.activeSources.add(source);
      this.callbacks?.onStatusChange?.('speaking');

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0 && !this.isDisconnecting && this.isConnectedState) {
          this.nextStartTime = 0;
          this.callbacks?.onStatusChange?.('listening');
        }
      };

      source.start(startAt);
    } catch {
      // ignore audio scheduling errors
    }
  }

  public stopScheduledOutputAudio(): void {
    this.activeSources.forEach((src) => {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });
    this.activeSources.clear();
    this.nextStartTime = 0;
  }

  public sendTelemetrySnapshot(snapshotPayload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !snapshotPayload) return;
    try {
      this.ws.send(JSON.stringify({ telemetrySnapshot: snapshotPayload }));
    } catch {
      // ignore
    }
  }

  public sendTextPrompt(text: string): void {
    const clean = (text || '').trim();
    if (!clean || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.currentInputTranscript = clean;
    this.ensureUserTurnCommitted();
    this.callbacks?.onStatusChange?.('generating_response');
    try {
      this.ws.send(JSON.stringify({ text: clean }));
    } catch {
      // ignore
    }
  }

  public disconnect(): void {
    this.isDisconnecting = true;
    this.isConnectedState = false;
    this.currentInputTranscript = '';
    this.currentOutputTranscript = '';
    this.currentTurnId = null;

    if (this.animFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.stopScheduledOutputAudio();

    if (this.processorNode) {
      try {
        this.processorNode.onaudioprocess = null;
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch {
        // ignore
      }
      this.analyserNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close();
      } catch {
        // ignore
      }
      this.inputAudioCtx = null;
    }

    if (this.outputAudioCtx) {
      try {
        this.outputAudioCtx.close();
      } catch {
        // ignore
      }
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close();
        }
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
