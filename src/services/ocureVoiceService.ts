/**
 * OCURE COACH VOICE SERVICE (Revision 5)
 * Neural, conversational human coaching voice service for OCURE Coach.
 *
 * Audio Output Architecture (OCURE_VOICE.md §5):
 *   - ONE shared persistent AudioContext (24000 Hz) and ONE persistent GainNode
 *     connected once to ctx.destination for the lifetime of the app.
 *   - Every utterance buffer has a ~10 ms fade-in, ~20 ms fade-out, and ~50 ms of
 *     trailing digital silence baked directly into its PCM samples at matching sample rate.
 *   - Never calls stop(), pause(), cancel(), or disconnects GainNode at natural utterance end.
 *   - Non-overlapping priority queue: step_instruction > camera_prompt > mid_step_nudge.
 *     Step instructions wait up to 3 s for an active line to finish naturally; mid-step
 *     nudges arriving during active speech are dropped immediately.
 *   - Manual Pause, Stop, and switching Voice off cancel speech immediately.
 */

import type { OcureVoiceDeliveryContext } from '../data/ocureExercises';

export const OCURE_AUDIO_CONFIG = {
  FADE_IN_MS: 10, // ~10 ms fade-in applied to every line's buffer (OCURE_VOICE.md §5)
  FADE_OUT_MS: 20, // ~20 ms fade-out applied to every line's buffer (OCURE_VOICE.md §5)
  TRAILING_SILENCE_MS: 50, // ~50 ms trailing silence appended to every line's buffer (OCURE_VOICE.md §5)
  STEP_INSTRUCTION_MAX_WAIT_MS: 3000, // Step-start instruction waits up to 3 s for current line to finish
};

export const OCURE_VOICE_PREF_KEY = 'iris_ocure_voice_enabled_v1';
export const OCURE_NEURAL_VOICE_NAME = 'Meditation Guide';
export const OCURE_NEURAL_VOICE_DESCRIPTION = 'Airy & soothing';
export const OCURE_NEURAL_VOICE_ID = 'voice_unkpf0tjxq6l';
export const OCURE_AISTUDIO_VOICE_PRESET_ID = 'voice-meditation-guide';
export const OCURE_NEURAL_PRIMARY_MODEL = 'gemini-2.0-flash';

export type VoiceLinePriority = 'step_instruction' | 'camera_prompt' | 'mid_step_nudge';

export interface VoiceLineDiagnostic {
  instructionId: string;
  text: string;
  sourceType: 'web-audio-neural' | 'browser-speech-synthesis';
  sampleRate: number;
  contextSampleRate: number;
  durationSec: number;
  fadeInMs: number;
  fadeOutMs: number;
  trailingSilenceMs: number;
  lastSamplesMaxAmplitude: number;
  abruptStopAtEnd: boolean;
  createdNewAudioContext: boolean;
  createdNewGainNode: boolean;
  voiceUsed: string;
  timestampMs: number;
}

export function getStoredVoicePref(): boolean {
  try {
    const val = localStorage.getItem(OCURE_VOICE_PREF_KEY);
    if (val !== null) {
      return val === 'true';
    }
  } catch {
    // fallback
  }
  return true;
}

export function setStoredVoicePref(enabled: boolean): void {
  try {
    localStorage.setItem(OCURE_VOICE_PREF_KEY, String(enabled));
  } catch {
    // fallback
  }
}

export interface SpeakOptions {
  /**
   * When true, wait up to 3 s for current line to finish (or cancel immediately if forceCancelNow is true).
   */
  interrupt?: boolean;
  /** Cancel current speech immediately (used by Repeat or explicit user action) */
  forceCancelNow?: boolean;
  /** Whether this utterance is a mid-step nudge or reminder that should be dropped if speech is already playing */
  isReminder?: boolean;
  /** Explicit priority: step_instruction > camera_prompt > mid_step_nudge */
  priority?: VoiceLinePriority;
  /** Whether this utterance should be remembered as the repeatable step instruction */
  recordAsRepeatable?: boolean;
  /** Delivery context for natural intonation styling */
  context?: OcureVoiceDeliveryContext;
  /** Fallback browser TTS rate override (default: 0.96) */
  rate?: number;
  /** Fallback browser TTS pitch override (default: 1.0 - no synthetic pitch warp) */
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

export interface PreloadVoiceItem {
  text: string;
  context?: OcureVoiceDeliveryContext;
}

/**
 * Normalizes numbers, units, abbreviations, and punctuation so both neural TTS
 * and fallback browser speech synthesis pronounce them naturally in conversation.
 */
export function normalizeTextForSpeech(rawText: string): string {
  if (!rawText || typeof rawText !== 'string') return '';

  let text = rawText.trim();

  // Strip any accidental markdown emphasis or code ticks
  text = text.replace(/[*_`~]+/g, '');

  // Expand range patterns like "3–4 s" or "3-4s" -> "3 to 4 seconds"
  text = text.replace(/\b(\d+)\s*[–—-]\s*(\d+)\s*s(?:ec(?:ond)?s?)?\b/gi, '$1 to $2 seconds');
  text = text.replace(/\b(\d+)\s*[–—-]\s*(\d+)\s*cm\b/gi, '$1 to $2 centimeters');
  text = text.replace(/\b(\d+)\s*[–—-]\s*(\d+)\s*bpm\b/gi, '$1 to $2 blinks per minute');
  text = text.replace(/\b(\d+)\s*[–—-]\s*(\d+)\b/g, '$1 to $2');

  // Expand standalone units: BPM, cm, seconds
  text = text.replace(/\b(\d+(?:\.\d+)?)\s*bpm\b/gi, '$1 blinks per minute');
  text = text.replace(/\bbpm\b/gi, 'blinks per minute');
  text = text.replace(/\b(\d+(?:\.\d+)?)\s*cm\b/gi, '$1 centimeters');
  text = text.replace(/\b(\d+)\s*s\b/g, '$1 seconds');

  // Replace em-dashes and en-dashes with a natural comma pause
  text = text.replace(/\s*[—–]\s*/g, ', ');

  // Normalize multiple spaces
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

/**
 * Splits normalized text into natural conversational sentences so browser fallback
 * TTS pauses naturally between clauses instead of rushing through a paragraph.
 */
export function splitIntoConversationalSentences(text: string): string[] {
  const clean = normalizeTextForSpeech(text);
  if (!clean) return [];

  const parts = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [clean];
}

const NOVELTY_VOICE_BLACKLIST = [
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'deranged',
  'fred',
  'good news',
  'hysterical',
  'jester',
  'junior',
  'organ',
  'ralph',
  'superstar',
  'trinoids',
  'whisper',
  'wobble',
  'zarvox',
  'espeak',
];

const PREFERRED_VOICE_KEYWORDS = [
  'ava (premium)',
  'ava (enhanced)',
  'samantha (enhanced)',
  'allison (enhanced)',
  'jenny',
  'aria',
  'sonia',
  'ava',
  'samantha',
  'allison',
  'natural',
  'neural',
  'google us english',
  'google uk english female',
  'karen',
  'moira',
  'serena',
  'premium',
  'enhanced',
];

function scoreBrowserVoice(voice: SpeechSynthesisVoice): number {
  const nameLower = voice.name.toLowerCase();
  const langLower = (voice.lang || '').toLowerCase();

  if (!langLower.startsWith('en')) {
    return -1000;
  }

  for (const blocked of NOVELTY_VOICE_BLACKLIST) {
    if (nameLower.includes(blocked)) {
      return -500;
    }
  }

  let score = 10;

  if (langLower === 'en-us' || langLower === 'en_us') score += 25;
  else if (
    langLower === 'en-gb' ||
    langLower === 'en-au' ||
    langLower === 'en-ie' ||
    langLower === 'en-ca'
  ) {
    score += 20;
  }

  if (voice.localService) {
    score += 8;
  }

  for (let i = 0; i < PREFERRED_VOICE_KEYWORDS.length; i++) {
    const keyword = PREFERRED_VOICE_KEYWORDS[i];
    if (nameLower.includes(keyword)) {
      score += 100 - i * 3;
      break;
    }
  }

  if (voice.default) {
    score += 5;
  }

  return score;
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/**
 * Extracts raw 16-bit PCM bytes from either a RIFF/WAVE container or raw PCM bytes.
 * Properly walks RIFF subchunks so non-audio chunks (fmt, JUNK, LIST/INFO metadata at start or end)
 * are never decoded as audio samples, eliminating end-of-segment clicks/ticks.
 */
export function extractPcmBytesFromWavOrRaw(bytes: Uint8Array): Uint8Array {
  if (
    bytes.byteLength >= 44 &&
    bytes[0] === 0x52 && // 'R'
    bytes[1] === 0x49 && // 'I'
    bytes[2] === 0x46 && // 'F'
    bytes[3] === 0x46 && // 'F'
    bytes[8] === 0x57 && // 'W'
    bytes[9] === 0x41 && // 'A'
    bytes[10] === 0x56 && // 'V'
    bytes[11] === 0x45 // 'E'
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 12;
    while (offset + 8 <= bytes.byteLength) {
      const id0 = bytes[offset];
      const id1 = bytes[offset + 1];
      const id2 = bytes[offset + 2];
      const id3 = bytes[offset + 3];
      const chunkSize = view.getUint32(offset + 4, true);
      const dataStart = offset + 8;

      // 'data' chunk
      if (id0 === 0x64 && id1 === 0x61 && id2 === 0x74 && id3 === 0x61) {
        const available = Math.max(0, Math.min(chunkSize, bytes.byteLength - dataStart));
        const evenLen = available & ~1;
        return bytes.subarray(dataStart, dataStart + evenLen);
      }

      const paddedChunkSize = chunkSize + (chunkSize & 1);
      if (paddedChunkSize < 0 || dataStart + paddedChunkSize > bytes.byteLength) {
        break;
      }
      offset = dataStart + paddedChunkSize;
    }

    const fallbackLen = (bytes.byteLength - 44) & ~1;
    return bytes.subarray(44, 44 + Math.max(0, fallbackLen));
  }

  const evenLen = bytes.byteLength & ~1;
  return bytes.subarray(0, evenLen);
}

/**
 * Decodes 16-bit signed little-endian PCM bytes into normalized [-1, 1] float samples,
 * removes DC offset, strips trailing synthesis boundary impulses, applies a ~10 ms fade-in
 * and ~20 ms fade-out directly to the buffer, and appends ~50 ms of trailing silence
 * (OCURE_VOICE.md §5) so playback always starts and ends at exact 0.000000 without clicks.
 */
export function sanitizeAndTaperPcmSamples(
  pcmBytes: Uint8Array,
  sampleRate = 24000,
  options?: { isChunk?: boolean; targetSampleRate?: number }
): Float32Array {
  const rawSampleCount = Math.floor(pcmBytes.byteLength / 2);
  if (rawSampleCount <= 0) return new Float32Array(0);

  const isChunk = Boolean(options?.isChunk);
  const view = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, rawSampleCount * 2);

  // 1. Decode int16 samples and compute mean for DC-offset removal
  const decoded = new Float32Array(rawSampleCount);
  let sum = 0;
  for (let i = 0; i < rawSampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    const val = int16 < 0 ? int16 / 32768 : int16 / 32767;
    decoded[i] = val;
    sum += val;
  }

  const dcOffset = sum / rawSampleCount;
  if (Math.abs(dcOffset) > 1e-6) {
    for (let i = 0; i < rawSampleCount; i++) {
      const centered = decoded[i] - dcOffset;
      decoded[i] = Math.max(-1, Math.min(1, centered));
    }
  }

  // Optional resample if buffer sampleRate differs from AudioContext sampleRate
  const targetRate =
    options?.targetSampleRate && options.targetSampleRate > 0
      ? options.targetSampleRate
      : sampleRate;
  let workingSamples = decoded;
  if (targetRate !== sampleRate && rawSampleCount > 1) {
    const ratio = targetRate / sampleRate;
    const resampledLen = Math.max(1, Math.round(rawSampleCount * ratio));
    const resampled = new Float32Array(resampledLen);
    for (let i = 0; i < resampledLen; i++) {
      const srcPos = i / ratio;
      const idx0 = Math.min(rawSampleCount - 1, Math.floor(srcPos));
      const idx1 = Math.min(rawSampleCount - 1, idx0 + 1);
      const frac = srcPos - idx0;
      resampled[i] = decoded[idx0] * (1 - frac) + decoded[idx1] * frac;
    }
    workingSamples = resampled;
  }

  const sampleCount = workingSamples.length;
  // Append ~50 ms of trailing silence at the end of full buffers (OCURE_VOICE.md §5)
  const tailSilenceSamples = isChunk
    ? 0
    : Math.floor(targetRate * (OCURE_AUDIO_CONFIG.TRAILING_SILENCE_MS / 1000));
  const output = new Float32Array(sampleCount + tailSilenceSamples);
  output.set(workingSamples, 0);

  // 2. Suppress any isolated end-of-synthesis transient spike in the final 6ms of speech
  const tailCheckSamples = Math.min(sampleCount, Math.floor(targetRate * 0.006));
  if (!isChunk && sampleCount > tailCheckSamples * 4) {
    let preTailRmsSum = 0;
    const preTailWindow = tailCheckSamples * 2;
    const preTailStart = sampleCount - tailCheckSamples - preTailWindow;
    for (let i = preTailStart; i < sampleCount - tailCheckSamples; i++) {
      preTailRmsSum += output[i] * output[i];
    }
    const preTailRms = Math.sqrt(preTailRmsSum / preTailWindow);
    if (preTailRms < 0.015) {
      const maxAllowed = Math.max(0.002, preTailRms * 2.0);
      for (let i = sampleCount - tailCheckSamples; i < sampleCount; i++) {
        if (Math.abs(output[i]) > maxAllowed) {
          output[i] = Math.sign(output[i]) * maxAllowed;
        }
      }
    }
  }

  // 3. Apply ~10 ms fade-in and ~20 ms fade-out directly to the line's buffer (OCURE_VOICE.md §5)
  const fadeInDurationSec = isChunk ? 0.005 : OCURE_AUDIO_CONFIG.FADE_IN_MS / 1000;
  const fadeOutDurationSec = isChunk ? 0.008 : OCURE_AUDIO_CONFIG.FADE_OUT_MS / 1000;

  const fadeInSamples = Math.min(
    Math.floor(targetRate * fadeInDurationSec),
    Math.floor(sampleCount * 0.25)
  );
  const fadeOutSamples = Math.min(
    Math.floor(targetRate * fadeOutDurationSec),
    Math.floor(sampleCount * 0.35)
  );

  if (fadeInSamples > 1) {
    output[0] = 0;
    for (let i = 1; i < fadeInSamples; i++) {
      const gain = 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples));
      output[i] *= gain;
    }
  }

  if (fadeOutSamples > 1) {
    const startIdx = sampleCount - fadeOutSamples;
    for (let i = 0; i < fadeOutSamples; i++) {
      const gain = 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / fadeOutSamples));
      output[startIdx + i] *= gain;
    }
    output[sampleCount - 1] = 0;
  }

  // Remaining tailSilenceSamples (sampleCount .. output.length - 1) are exact 0.000000
  return output;
}

/**
 * Computes per-line end amplitude diagnostics on a sanitized Float32Array buffer (OCURE_VOICE.md §5).
 */
export function inspectSanitizedBufferEnd(
  samples: Float32Array,
  sampleRate = 24000
): {
  totalSamples: number;
  durationSec: number;
  last16SamplesMaxAmplitude: number;
  trailingSilenceSamples: number;
  trailingSilenceMaxAmplitude: number;
} {
  const totalSamples = samples.length;
  const durationSec = sampleRate > 0 ? totalSamples / sampleRate : 0;
  const silenceCount = Math.min(
    totalSamples,
    Math.floor(sampleRate * (OCURE_AUDIO_CONFIG.TRAILING_SILENCE_MS / 1000))
  );
  let last16Max = 0;
  for (let i = Math.max(0, totalSamples - 16); i < totalSamples; i++) {
    last16Max = Math.max(last16Max, Math.abs(samples[i]));
  }
  let silenceMax = 0;
  for (let i = Math.max(0, totalSamples - silenceCount); i < totalSamples; i++) {
    silenceMax = Math.max(silenceMax, Math.abs(samples[i]));
  }
  return {
    totalSamples,
    durationSec,
    last16SamplesMaxAmplitude: last16Max,
    trailingSilenceSamples: silenceCount,
    trailingSilenceMaxAmplitude: silenceMax,
  };
}

/**
 * Converts 16-bit signed little-endian PCM bytes into a de-clicked AudioBuffer
 * matched to the AudioContext's sampleRate.
 */
function pcm16BytesToAudioBuffer(
  ctx: AudioContext,
  pcmBytes: Uint8Array,
  sourceSampleRate = 24000,
  options?: { isChunk?: boolean }
): AudioBuffer | null {
  const targetSampleRate = ctx.sampleRate || sourceSampleRate;
  const sanitized = sanitizeAndTaperPcmSamples(pcmBytes, sourceSampleRate, {
    ...options,
    targetSampleRate,
  });
  if (sanitized.length <= 0) return null;

  const audioBuffer = ctx.createBuffer(1, sanitized.length, targetSampleRate);
  const channelData = audioBuffer.getChannelData(0);
  channelData.set(sanitized);

  return audioBuffer;
}

interface QueuedSpeechItem {
  instructionId: string;
  text: string;
  priority: VoiceLinePriority;
  options: SpeakOptions;
  enqueuedAtMs: number;
}

function getPriorityRank(priority: VoiceLinePriority): number {
  switch (priority) {
    case 'step_instruction':
      return 3;
    case 'camera_prompt':
      return 2;
    case 'mid_step_nudge':
    default:
      return 1;
  }
}

class OcureVoiceServiceImpl {
  private selectedBrowserVoice: SpeechSynthesisVoice | null = null;
  private voicesLoaded = false;
  private enabled: boolean = getStoredVoicePref();
  private speakingState = false;
  private lastRepeatable: {
    instructionId: string;
    text: string;
    context: OcureVoiceDeliveryContext;
  } | null = null;
  private currentInstructionId: string | null = null;
  private lastSpokenText: string = '';
  private listeners: Set<(speaking: boolean) => void> = new Set();
  private textListeners: Set<(text: string) => void> = new Set();
  private speechQueue: QueuedSpeechItem[] = [];
  private stepInstructionWaitTimer: ReturnType<typeof setTimeout> | null = null;

  // ONE shared persistent AudioContext + ONE persistent GainNode (OCURE_VOICE.md §5)
  private audioCtx: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private audioContextCreateCount = 0;
  private gainNodeCreateCount = 0;
  private activeTurnId = 0;
  private activeAbortController: AbortController | null = null;
  private activeSourceNodes: Set<AudioBufferSourceNode> = new Set();
  private audioBufferCache: Map<string, AudioBuffer> = new Map();
  private inFlightPreloads: Map<string, Promise<AudioBuffer | null>> = new Map();
  private lastActiveEngine: 'gemini-neural-tts' | 'browser-speech-synthesis' = 'gemini-neural-tts';
  private lastActiveModel: string = OCURE_NEURAL_PRIMARY_MODEL;
  private lastActiveVoiceId: string = OCURE_NEURAL_VOICE_ID;
  private serverFallbackCooldownUntil = 0;

  // Dev-only per-line instrumentation log (OCURE_VOICE.md §5 & Criterion 19)
  private lineDiagnostics: VoiceLineDiagnostic[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      if (this.isBrowserSpeechAvailable()) {
        this.loadBrowserVoices();
        try {
          if ('onvoiceschanged' in window.speechSynthesis) {
            window.speechSynthesis.addEventListener('voiceschanged', () => {
              this.loadBrowserVoices();
            });
          }
        } catch {
          window.speechSynthesis.onvoiceschanged = () => {
            this.loadBrowserVoices();
          };
        }
      }

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) {
            this.stop();
          }
        });
      }
    }
  }

  private isBrowserSpeechAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance !== 'undefined'
    );
  }

  private isWebAudioAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      (typeof window.AudioContext !== 'undefined' ||
        typeof (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext !== 'undefined')
    );
  }

  public isAvailable(): boolean {
    return this.isWebAudioAvailable() || this.isBrowserSpeechAvailable();
  }

  /**
   * Returns the single shared AudioContext and ensures the single persistent
   * masterGainNode is connected to ctx.destination.
   */
  private getOrCreateSharedAudioOutput(): {
    ctx: AudioContext;
    masterGain: GainNode;
    createdNewContext: boolean;
    createdNewGain: boolean;
  } | null {
    if (!this.isWebAudioAvailable()) return null;
    let createdNewContext = false;
    let createdNewGain = false;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextCtor({ sampleRate: 24000 });
      this.audioContextCreateCount += 1;
      createdNewContext = this.audioContextCreateCount > 1;
      this.masterGainNode = null;
    }

    if (!this.masterGainNode) {
      this.masterGainNode = this.audioCtx.createGain();
      this.masterGainNode.gain.value = 1.0;
      this.masterGainNode.connect(this.audioCtx.destination);
      this.gainNodeCreateCount += 1;
      createdNewGain = this.gainNodeCreateCount > 1;
    }

    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    return {
      ctx: this.audioCtx,
      masterGain: this.masterGainNode,
      createdNewContext,
      createdNewGain,
    };
  }

  private loadBrowserVoices(): void {
    if (!this.isBrowserSpeechAvailable()) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      this.voicesLoaded = true;
      let bestVoice: SpeechSynthesisVoice | null = null;
      let bestScore = -999;

      for (const v of voices) {
        const s = scoreBrowserVoice(v);
        if (s > bestScore) {
          bestScore = s;
          bestVoice = v;
        }
      }

      this.selectedBrowserVoice =
        bestVoice || voices.find((v) => v.lang.startsWith('en')) || voices[0];
    } catch {
      // Ignore voice enumeration errors
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    setStoredVoicePref(enabled);
    if (!enabled) {
      this.stop();
    }
  }

  public isSpeaking(): boolean {
    return this.speakingState;
  }

  public getSelectedVoiceName(): string | null {
    if (this.lastActiveEngine === 'gemini-neural-tts') {
      return `${OCURE_NEURAL_VOICE_NAME} — ${OCURE_NEURAL_VOICE_DESCRIPTION} (${this.lastActiveVoiceId})`;
    }
    if (!this.voicesLoaded) {
      this.loadBrowserVoices();
    }
    return this.selectedBrowserVoice?.name || OCURE_NEURAL_VOICE_NAME;
  }

  public getActiveEngineInfo(): {
    engine: 'gemini-neural-tts' | 'browser-speech-synthesis';
    voiceName: string;
    voiceDescription: string;
    voiceId: string;
    aiStudioPresetId: string;
    model: string;
    limitationNote: string;
  } {
    return {
      engine: this.lastActiveEngine,
      voiceName:
        this.lastActiveEngine === 'gemini-neural-tts'
          ? OCURE_NEURAL_VOICE_NAME
          : this.selectedBrowserVoice?.name || 'Browser Default',
      voiceDescription: OCURE_NEURAL_VOICE_DESCRIPTION,
      voiceId: this.lastActiveVoiceId,
      aiStudioPresetId: OCURE_AISTUDIO_VOICE_PRESET_ID,
      model:
        this.lastActiveEngine === 'gemini-neural-tts'
          ? this.lastActiveModel
          : 'window.speechSynthesis',
      limitationNote:
        'When fallback browser window.speechSynthesis is used, audio output is routed by the OS speech synthesizer and cannot be faded in code; cancel() is never called at natural utterance end.',
    };
  }

  /**
   * Returns dev-only per-line instrumentation records (OCURE_VOICE.md §5 & Criterion 19).
   */
  public getLineDiagnostics(): VoiceLineDiagnostic[] {
    return [...this.lineDiagnostics];
  }

  public getSharedAudioGraphStats(): {
    audioContextCreateCount: number;
    gainNodeCreateCount: number;
    queuedCount: number;
  } {
    return {
      audioContextCreateCount: this.audioContextCreateCount,
      gainNodeCreateCount: this.gainNodeCreateCount,
      queuedCount: this.speechQueue.length,
    };
  }

  private recordLineDiagnostic(diag: VoiceLineDiagnostic): void {
    this.lineDiagnostics.push(diag);
    if (this.lineDiagnostics.length > 100) {
      this.lineDiagnostics.shift();
    }
  }

  public subscribeSpeakingState(listener: (speaking: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public subscribeUtteranceText(listener: (text: string) => void): () => void {
    this.textListeners.add(listener);
    return () => {
      this.textListeners.delete(listener);
    };
  }

  public getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  private notifyUtteranceText(text: string): void {
    this.lastSpokenText = text;
    this.textListeners.forEach((cb) => cb(text));
  }

  private setSpeaking(val: boolean): void {
    if (this.speakingState !== val) {
      this.speakingState = val;
      this.listeners.forEach((cb) => cb(val));
    }
  }

  private makeCacheKey(normalizedText: string, context: OcureVoiceDeliveryContext): string {
    return `${OCURE_NEURAL_VOICE_NAME}::${context}::${normalizedText}`;
  }

  public recordRepeatableInstruction(
    instructionId: string,
    text: string,
    context: OcureVoiceDeliveryContext = 'instruction'
  ): void {
    this.lastRepeatable = { instructionId, text, context };
  }

  public getLastRepeatableInstruction(): {
    instructionId: string;
    text: string;
    context?: OcureVoiceDeliveryContext;
  } | null {
    return this.lastRepeatable;
  }

  /**
   * Warms the client and server caches in the background for upcoming routine steps
   * so that step transitions play neural speech instantaneously (0ms network wait).
   */
  public preloadRoutineCues(items: PreloadVoiceItem[]): void {
    if (!this.isWebAudioAvailable() || typeof fetch === 'undefined') return;
    if (Date.now() < this.serverFallbackCooldownUntil) return;

    const uniqueItems: Array<{
      normalizedText: string;
      context: OcureVoiceDeliveryContext;
      key: string;
    }> = [];
    const seen = new Set<string>();

    for (const item of items) {
      const normalizedText = normalizeTextForSpeech(item.text);
      const context = item.context || 'instruction';
      if (!normalizedText) continue;
      const key = this.makeCacheKey(normalizedText, context);
      if (!seen.has(key) && !this.audioBufferCache.has(key) && !this.inFlightPreloads.has(key)) {
        seen.add(key);
        uniqueItems.push({ normalizedText, context, key });
      }
    }

    if (uniqueItems.length === 0) return;

    void (async () => {
      for (const { normalizedText, context, key } of uniqueItems) {
        if (this.audioBufferCache.has(key)) continue;
        if (Date.now() < this.serverFallbackCooldownUntil) break;
        const buf = await this.fetchUnaryAudioBuffer(normalizedText, context);
        if (!buf) break;
      }
    })();
  }

  private async fetchUnaryAudioBuffer(
    normalizedText: string,
    context: OcureVoiceDeliveryContext,
    signal?: AbortSignal
  ): Promise<AudioBuffer | null> {
    const key = this.makeCacheKey(normalizedText, context);
    const cached = this.audioBufferCache.get(key);
    if (cached) return cached;
    if (Date.now() < this.serverFallbackCooldownUntil) return null;

    const existingPromise = this.inFlightPreloads.get(key);
    if (existingPromise && !signal) {
      return existingPromise;
    }

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const response = await fetch('/api/ocure-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: normalizedText, context }),
          signal,
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (data?.fallback) {
          this.serverFallbackCooldownUntil = Date.now() + 60_000;
          return null;
        }
        if (!data?.audioBase64) return null;

        const shared = this.getOrCreateSharedAudioOutput();
        if (!shared) return null;

        const rawBytes = base64ToUint8Array(data.audioBase64);
        const pcmBytes = extractPcmBytesFromWavOrRaw(rawBytes);
        const audioBuffer = pcm16BytesToAudioBuffer(
          shared.ctx,
          pcmBytes,
          data.sampleRate || 24000
        );

        if (audioBuffer) {
          this.audioBufferCache.set(key, audioBuffer);
          if (data.model) this.lastActiveModel = data.model;
          if (data.voiceId) this.lastActiveVoiceId = data.voiceId;
          this.lastActiveEngine = 'gemini-neural-tts';
        }
        return audioBuffer;
      } catch {
        return null;
      } finally {
        this.inFlightPreloads.delete(key);
      }
    })();

    if (!signal) {
      this.inFlightPreloads.set(key, promise);
    }

    return promise;
  }

  /**
   * Plays a cached or freshly decoded AudioBuffer on the single shared AudioContext
   * and persistent masterGainNode.
   * Never creates or disconnects a GainNode per line, and never calls stop(), pause(),
   * cancel(), or close() at the moment a line ends naturally (OCURE_VOICE.md §5).
   */
  private playAudioBuffer(
    instructionId: string,
    text: string,
    buffer: AudioBuffer,
    turnId: number,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if (turnId !== this.activeTurnId) return;

    const shared = this.getOrCreateSharedAudioOutput();
    if (!shared) {
      this.setSpeaking(false);
      onEnd?.();
      return;
    }

    const { ctx, masterGain, createdNewContext, createdNewGain } = shared;

    // Ensure persistent masterGain is at unity 1.0 before starting buffer
    const now = ctx.currentTime;
    try {
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.setValueAtTime(1.0, now);
    } catch {
      masterGain.gain.value = 1.0;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(masterGain);
    this.activeSourceNodes.add(source);

    const chan = buffer.getChannelData(0);
    const endInspection = inspectSanitizedBufferEnd(chan, buffer.sampleRate);

    this.setSpeaking(true);
    onStart?.();

    source.onended = () => {
      this.activeSourceNodes.delete(source);
      // Do NOT call stop(), pause(), cancel(), or disconnect masterGain at natural end!
      const wasNaturalEnd = turnId === this.activeTurnId;
      this.recordLineDiagnostic({
        instructionId,
        text,
        sourceType: 'web-audio-neural',
        sampleRate: buffer.sampleRate,
        contextSampleRate: ctx.sampleRate,
        durationSec: Number(buffer.duration.toFixed(3)),
        fadeInMs: OCURE_AUDIO_CONFIG.FADE_IN_MS,
        fadeOutMs: OCURE_AUDIO_CONFIG.FADE_OUT_MS,
        trailingSilenceMs: OCURE_AUDIO_CONFIG.TRAILING_SILENCE_MS,
        lastSamplesMaxAmplitude: endInspection.last16SamplesMaxAmplitude,
        abruptStopAtEnd: !wasNaturalEnd,
        createdNewAudioContext: createdNewContext,
        createdNewGainNode: createdNewGain,
        voiceUsed: `${OCURE_NEURAL_VOICE_NAME} (${this.lastActiveVoiceId})`,
        timestampMs: Date.now(),
      });

      if (wasNaturalEnd && this.activeSourceNodes.size === 0) {
        this.setSpeaking(false);
        onEnd?.();
      }
    };

    source.start(now);
  }

  /**
   * Streams 24kHz PCM chunks from `/api/ocure-tts-stream`, assembles a unified
   * DC-balanced, de-clicked AudioBuffer (~10ms fade-in, ~20ms fade-out, ~50ms trailing silence),
   * caches it, and plays it seamlessly on the shared persistent GainNode.
   */
  private async streamAndPlayNeuralTts(
    instructionId: string,
    normalizedText: string,
    context: OcureVoiceDeliveryContext,
    turnId: number,
    signal: AbortSignal,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<boolean> {
    const shared = this.getOrCreateSharedAudioOutput();
    if (!shared || typeof fetch === 'undefined') return false;
    const { ctx } = shared;

    const key = this.makeCacheKey(normalizedText, context);
    const cached = this.audioBufferCache.get(key);
    if (cached) {
      this.lastActiveEngine = 'gemini-neural-tts';
      this.playAudioBuffer(instructionId, normalizedText, cached, turnId, onStart, onEnd);
      return true;
    }

    if (Date.now() < this.serverFallbackCooldownUntil) {
      return false;
    }

    const preloadInFlight = this.inFlightPreloads.get(key);
    if (preloadInFlight) {
      const preloadedBuf = await preloadInFlight;
      if (turnId !== this.activeTurnId || signal.aborted) return true;
      if (preloadedBuf) {
        this.lastActiveEngine = 'gemini-neural-tts';
        this.playAudioBuffer(instructionId, normalizedText, preloadedBuf, turnId, onStart, onEnd);
        return true;
      }
    }

    const response = await fetch('/api/ocure-tts-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: normalizedText, context }),
      signal,
    });

    if (!response.ok || !response.body) {
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const collectedPcmArrays: Uint8Array[] = [];
    let totalPcmByteLength = 0;
    let streamSampleRate = 24000;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (turnId !== this.activeTurnId || signal.aborted) {
        await reader.cancel().catch(() => {});
        return true;
      }

      sseBuffer += decoder.decode(value, { stream: true });
      const events = sseBuffer.split('\n\n');
      sseBuffer = events.pop() || '';

      for (const evt of events) {
        const line = evt.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;

        let payload: {
          pcmBase64?: string;
          sampleRate?: number;
          done?: boolean;
          model?: string;
          voiceId?: string;
          error?: string;
          fallback?: boolean;
        };
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          continue;
        }

        if (payload.fallback || payload.error) {
          if (payload.fallback) {
            this.serverFallbackCooldownUntil = Date.now() + 60_000;
          }
          if (totalPcmByteLength === 0) return false;
          break;
        }

        if (payload.pcmBase64) {
          const rawBytes = base64ToUint8Array(payload.pcmBase64);
          const pcmBytes = extractPcmBytesFromWavOrRaw(rawBytes);
          if (pcmBytes.byteLength > 0) {
            collectedPcmArrays.push(pcmBytes);
            totalPcmByteLength += pcmBytes.byteLength;
            if (payload.sampleRate) {
              streamSampleRate = payload.sampleRate;
            }
          }
        }

        if (payload.done) {
          if (payload.model) {
            this.lastActiveModel = payload.model;
          }
          if (payload.voiceId) {
            this.lastActiveVoiceId = payload.voiceId;
          }
        }
      }
    }

    if (turnId !== this.activeTurnId || signal.aborted) {
      return true;
    }

    if (totalPcmByteLength <= 0) {
      return false;
    }

    const merged = new Uint8Array(totalPcmByteLength);
    let offset = 0;
    for (const arr of collectedPcmArrays) {
      merged.set(arr, offset);
      offset += arr.byteLength;
    }

    const fullBuffer = pcm16BytesToAudioBuffer(ctx, merged, streamSampleRate, { isChunk: false });
    if (!fullBuffer) {
      return false;
    }

    this.audioBufferCache.set(key, fullBuffer);
    this.lastActiveEngine = 'gemini-neural-tts';
    this.playAudioBuffer(instructionId, normalizedText, fullBuffer, turnId, onStart, onEnd);
    return true;
  }

  /**
   * Browser SpeechSynthesis fallback used only when offline or when
   * the server neural TTS endpoint cannot be reached.
   * Never calls synth.cancel() at natural utterance end (OCURE_VOICE.md §5).
   */
  private speakWithBrowserFallback(
    instructionId: string,
    normalizedText: string,
    turnId: number,
    rate: number,
    pitch: number,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if (!this.isBrowserSpeechAvailable()) {
      this.setSpeaking(false);
      onEnd?.();
      return;
    }

    if (!this.voicesLoaded) {
      this.loadBrowserVoices();
    }

    try {
      const synth = window.speechSynthesis;
      const sentences = splitIntoConversationalSentences(normalizedText);
      if (sentences.length === 0) {
        onEnd?.();
        return;
      }

      this.lastActiveEngine = 'browser-speech-synthesis';
      this.currentInstructionId = instructionId;
      const startTimeMs = Date.now();

      sentences.forEach((sentence, idx) => {
        const utterance = new window.SpeechSynthesisUtterance(sentence);
        if (this.selectedBrowserVoice) {
          utterance.voice = this.selectedBrowserVoice;
          utterance.lang = this.selectedBrowserVoice.lang || 'en-US';
        } else {
          utterance.lang = 'en-US';
        }

        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = 1.0;

        if (idx === 0) {
          utterance.onstart = () => {
            if (turnId === this.activeTurnId) {
              this.setSpeaking(true);
              onStart?.();
            }
          };
        }

        if (idx === sentences.length - 1) {
          utterance.onend = () => {
            // Never call synth.cancel() at natural end (OCURE_VOICE.md §5)
            const wasNaturalEnd = turnId === this.activeTurnId;
            this.recordLineDiagnostic({
              instructionId,
              text: normalizedText,
              sourceType: 'browser-speech-synthesis',
              sampleRate: 24000,
              contextSampleRate: 24000,
              durationSec: Number(((Date.now() - startTimeMs) / 1000).toFixed(3)),
              fadeInMs: 0,
              fadeOutMs: 0,
              trailingSilenceMs: 0,
              lastSamplesMaxAmplitude: 0,
              abruptStopAtEnd: !wasNaturalEnd,
              createdNewAudioContext: false,
              createdNewGainNode: false,
              voiceUsed: this.selectedBrowserVoice?.name || 'Browser Default',
              timestampMs: Date.now(),
            });
            if (wasNaturalEnd) {
              this.setSpeaking(false);
              onEnd?.();
            }
          };
        }

        utterance.onerror = () => {
          if (turnId === this.activeTurnId) {
            this.setSpeaking(false);
            onEnd?.();
          }
        };

        synth.speak(utterance);
      });
    } catch {
      this.setSpeaking(false);
      onEnd?.();
    }
  }

  private inferPriority(options: SpeakOptions): VoiceLinePriority {
    if (options.priority) return options.priority;
    if (options.isReminder) {
      return options.context === 'camera_warning' ? 'camera_prompt' : 'mid_step_nudge';
    }
    if (options.context === 'camera_warning') {
      return 'camera_prompt';
    }
    return 'step_instruction';
  }

  private clearStepWaitTimer(): void {
    if (this.stepInstructionWaitTimer) {
      clearTimeout(this.stepInstructionWaitTimer);
      this.stepInstructionWaitTimer = null;
    }
  }

  private enqueueSpeechItem(item: QueuedSpeechItem): void {
    // Priority: step_instruction > camera_prompt > mid_step_nudge
    if (item.priority === 'mid_step_nudge') {
      // Mid-step nudge while speaking is dropped, not queued (OCURE_VOICE.md §2 & §4)
      item.options.onEnd?.();
      return;
    }

    const itemRank = getPriorityRank(item.priority);
    // Keep at most one pending item per priority, dropping lower-priority stale items
    this.speechQueue = this.speechQueue.filter((q) => getPriorityRank(q.priority) > itemRank);
    this.speechQueue.push(item);
    this.speechQueue.sort((a, b) => getPriorityRank(b.priority) - getPriorityRank(a.priority));

    // A step-start instruction waits up to 3 s for the current line to finish, then plays (OCURE_VOICE.md §2)
    if (item.priority === 'step_instruction' && !this.stepInstructionWaitTimer) {
      this.stepInstructionWaitTimer = setTimeout(() => {
        this.stepInstructionWaitTimer = null;
        if (this.speakingState && this.speechQueue.length > 0) {
          const next = this.speechQueue.shift();
          if (next) {
            this.stopActivePlaybackOnly();
            this.playNow(next.instructionId, next.text, next.options);
          }
        }
      }, OCURE_AUDIO_CONFIG.STEP_INSTRUCTION_MAX_WAIT_MS);
    }
  }

  public speak(instructionId: string, text: string, options: SpeakOptions = {}): void {
    const {
      forceCancelNow = false,
      isReminder = false,
      recordAsRepeatable = false,
      context = 'instruction',
      onEnd,
    } = options;

    if (recordAsRepeatable) {
      this.lastRepeatable = { instructionId, text, context };
    }

    const cleanRaw = (text || '').trim();
    const normalizedText = normalizeTextForSpeech(cleanRaw);
    if (!normalizedText) {
      onEnd?.();
      return;
    }

    const priority = this.inferPriority(options);

    // If speaking is already in progress and not force-cancelling immediately:
    if (this.speakingState && !forceCancelNow) {
      if (isReminder && priority === 'mid_step_nudge') {
        // Drop mid-step nudges that would overlap speech in progress (OCURE_VOICE.md §2 & §4)
        onEnd?.();
        return;
      }
      this.enqueueSpeechItem({
        instructionId,
        text: cleanRaw,
        priority,
        options,
        enqueuedAtMs: Date.now(),
      });
      return;
    }

    if (forceCancelNow && (this.speakingState || this.activeSourceNodes.size > 0 || this.activeAbortController)) {
      this.stop();
    }

    this.playNow(instructionId, cleanRaw, options);
  }

  private playNow(instructionId: string, cleanRaw: string, options: SpeakOptions): void {
    const {
      context = 'instruction',
      rate = 0.96,
      pitch = 1.0,
      onStart,
      onEnd,
    } = options;

    this.clearStepWaitTimer();

    const normalizedText = normalizeTextForSpeech(cleanRaw);
    // Criterion 18 & OCURE_VOICE.md §2: Every spoken line is also shown as text
    this.notifyUtteranceText(cleanRaw);

    if (!this.enabled || !this.isAvailable()) {
      onEnd?.();
      return;
    }

    const turnId = ++this.activeTurnId;
    this.currentInstructionId = instructionId;
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const handleFinished = () => {
      this.clearStepWaitTimer();
      onEnd?.();
      if (turnId === this.activeTurnId && this.speechQueue.length > 0 && !this.speakingState) {
        const next = this.speechQueue.shift()!;
        this.playNow(next.instructionId, next.text, next.options);
      }
    };

    void (async () => {
      try {
        const playedNeural = await this.streamAndPlayNeuralTts(
          instructionId,
          normalizedText,
          context,
          turnId,
          abortController.signal,
          onStart,
          handleFinished
        );

        if (!playedNeural && turnId === this.activeTurnId && !abortController.signal.aborted) {
          if (this.isBrowserSpeechAvailable()) {
            this.speakWithBrowserFallback(
              instructionId,
              normalizedText,
              turnId,
              rate,
              pitch,
              onStart,
              handleFinished
            );
          } else {
            this.setSpeaking(false);
            handleFinished();
          }
        }
      } catch {
        if (turnId === this.activeTurnId && !abortController.signal.aborted) {
          if (this.isBrowserSpeechAvailable()) {
            this.speakWithBrowserFallback(
              instructionId,
              normalizedText,
              turnId,
              rate,
              pitch,
              onStart,
              handleFinished
            );
          } else {
            this.setSpeaking(false);
            handleFinished();
          }
        }
      }
    })();
  }

  public repeatCurrentInstruction(): boolean {
    if (!this.lastRepeatable || !this.isAvailable()) {
      return false;
    }
    if (!this.enabled) {
      this.setEnabled(true);
    }
    this.speak(this.lastRepeatable.instructionId, this.lastRepeatable.text, {
      interrupt: true,
      forceCancelNow: true,
      recordAsRepeatable: false,
      context: this.lastRepeatable.context,
    });
    return true;
  }

  /**
   * Immediately cancels any ongoing or queued speech (Manual Pause, Stop, Voice-off).
   */
  public cancel(): void {
    this.stop();
  }

  private stopActivePlaybackOnly(): void {
    this.activeTurnId++;
    this.clearStepWaitTimer();

    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {
        // safe ignore
      }
      this.activeAbortController = null;
    }

    if (this.audioCtx && this.masterGainNode && this.activeSourceNodes.size > 0) {
      const ctx = this.audioCtx;
      const masterGain = this.masterGainNode;
      const sourcesToStop = Array.from(this.activeSourceNodes);
      this.activeSourceNodes.clear();

      const now = ctx.currentTime;
      const fadeOutSec = OCURE_AUDIO_CONFIG.FADE_OUT_MS / 1000;
      try {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(Math.max(0, masterGain.gain.value), now);
        masterGain.gain.linearRampToValueAtTime(0.0, now + fadeOutSec);
      } catch {
        // safe ignore
      }

      setTimeout(() => {
        for (const source of sourcesToStop) {
          try {
            source.onended = null;
            source.stop();
            source.disconnect();
          } catch {
            // safe ignore
          }
        }
        try {
          if (this.audioCtx && this.masterGainNode) {
            this.masterGainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
          }
        } catch {
          // safe ignore
        }
      }, OCURE_AUDIO_CONFIG.FADE_OUT_MS + 5);
    } else {
      for (const source of this.activeSourceNodes) {
        try {
          source.onended = null;
          source.stop();
          source.disconnect();
        } catch {
          // safe ignore
        }
      }
      this.activeSourceNodes.clear();
    }

    if (
      this.lastActiveEngine === 'browser-speech-synthesis' &&
      this.speakingState &&
      this.isBrowserSpeechAvailable()
    ) {
      try {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // safe ignore
      }
    }

    this.currentInstructionId = null;
    this.setSpeaking(false);
  }

  public stop(): void {
    this.speechQueue = [];
    this.stopActivePlaybackOnly();
  }
}

export const ocureVoiceService = new OcureVoiceServiceImpl();
