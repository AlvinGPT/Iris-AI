/**
 * EXPRESSIVE TTS SERVICE (Microsoft Edge Neural Voices + Native Fallback)
 *
 * Requirements:
 * - Primary Online Engine: Microsoft Edge Neural Voices (via Express /api/edge-tts)
 * - Default Persona: 'en-US-AnaNeural' (friendly, expressive, empathetic female voice)
 *   Secondary Options: 'en-US-JennyNeural', 'en-US-EmmaMultilingualNeural'
 * - Parameters: Rate: '+0%' (or '+5%'), Pitch: '+0Hz', Volume: '+0%'
 * - Fast Playback: Audio buffer streaming & LRU caching for instant 0ms playback
 * - Resilient Fallback: Automatic failover to Web Speech API (window.speechSynthesis)
 *   with strict high-quality Neural/Natural female voice selection if network fails,
 *   times out (4s), or device is offline.
 */

export interface TtsOptions {
  voice?: string;
  rate?: string; // e.g. '+0%' or '+5%'
  pitch?: string; // e.g. '+0Hz'
  volume?: string; // e.g. '+0%'
  timeoutMs?: number;
  onStart?: () => void;
  onEnd?: () => void;
}

const DEFAULT_EDGE_VOICE = 'en-US-AnaNeural';
const SECONDARY_EDGE_VOICES = ['en-US-JennyNeural', 'en-US-EmmaMultilingualNeural'];

// Robotic legacy voices to explicitly reject during fallback
const ROBOTIC_VOICE_BLACKLIST = [
  'zira',
  'hazel',
  'david',
  'mark',
  'george',
  'albert',
  'zarvox',
  'espeak',
  'bad news',
  'bells',
  'deranged',
];

// Preferred high-quality natural female voice keywords for Web Speech API fallback
const PREFERRED_FALLBACK_VOICE_KEYWORDS = [
  'natural',
  'aria online (natural)',
  'jenny online (natural)',
  'sonia online (natural)',
  'google uk english female',
  'google us english female',
  'google us english',
  'ava (premium)',
  'ava (enhanced)',
  'samantha (enhanced)',
  'jenny',
  'aria',
  'sonia',
  'ava',
  'karen',
  'moira',
  'serena',
];

export class TtsService {
  private activeAudio: HTMLAudioElement | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private audioCache = new Map<string, string>(); // textKey -> blobUrl
  private isCurrentlySpeaking = false;
  private speakingListeners = new Set<(speaking: boolean) => void>();
  private defaultVoice = DEFAULT_EDGE_VOICE;

  constructor() {
    // Eagerly populate browser speech synthesis voice list if available
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.getVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = () => {
            // Voices ready in background
          };
        }
      } catch {
        // Safe ignore
      }
    }
  }

  /**
   * Primary asynchronous speak method.
   * Plays expressive Microsoft Edge Neural Voice ('en-US-AnaNeural'),
   * with automatic, graceful failover to soothing Web Speech API on network timeout/failure.
   */
  public async speak(text: string, voiceName?: string, options?: Partial<TtsOptions>): Promise<void> {
    const cleanText = (text || '').trim();
    if (!cleanText) return;

    // Stop any active utterance before starting the new line
    this.cancel();

    const selectedVoice = voiceName || options?.voice || this.defaultVoice;
    const rate = options?.rate || '+0%';
    const pitch = options?.pitch || '+0Hz';
    const volume = options?.volume || '+0%';
    const timeoutMs = options?.timeoutMs || 4000;

    this.setSpeaking(true);
    options?.onStart?.();

    // 1. Check if device is strictly offline
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (isOnline) {
      try {
        const played = await this.playEdgeNeuralVoice(cleanText, selectedVoice, rate, pitch, volume, timeoutMs);
        if (played) {
          this.setSpeaking(false);
          options?.onEnd?.();
          return;
        }
      } catch (err) {
        console.warn('[TtsService] Edge Neural Voice error, executing resilient native fallback:', err);
      }
    }

    // 2. Resilient Fallback: Web Speech API with modern Natural Female Voice
    try {
      await this.speakNativeFallback(cleanText);
    } catch (fallbackErr) {
      console.warn('[TtsService] Native TTS fallback error:', fallbackErr);
    } finally {
      this.setSpeaking(false);
      options?.onEnd?.();
    }
  }

  /**
   * Attempts to synthesize and play audio using Microsoft Edge Neural Voices over the server API.
   * Returns true on successful playback; false if failover should execute.
   */
  private async playEdgeNeuralVoice(
    text: string,
    voice: string,
    rate: string,
    pitch: string,
    volume: string,
    timeoutMs: number
  ): Promise<boolean> {
    const cacheKey = `${voice}::${rate}::${pitch}::${text}`;
    let blobUrl = this.audioCache.get(cacheKey);

    if (!blobUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch('/api/edge-tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            text,
            voice,
            rate,
            pitch,
            volume,
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!response.ok) {
          return false;
        }

        const data = await response.json();
        if (data.fallback || !data.audioBase64) {
          return false;
        }

        // Convert base64 MP3 audio to Object URL for direct, low-latency playback
        const binaryString = atob(data.audioBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        blobUrl = URL.createObjectURL(blob);

        // Keep a bounded cache of the last 100 spoken cues
        if (this.audioCache.size > 100) {
          const oldest = this.audioCache.keys().next().value;
          if (oldest) {
            const oldUrl = this.audioCache.get(oldest);
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            this.audioCache.delete(oldest);
          }
        }
        this.audioCache.set(cacheKey, blobUrl);
      } catch (e: any) {
        clearTimeout(timer);
        return false;
      }
    }

    if (!blobUrl) return false;

    return new Promise<boolean>((resolve) => {
      const audio = new Audio(blobUrl);
      audio.volume = 0.95;
      this.activeAudio = audio;

      audio.onended = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
        }
        resolve(true);
      };

      audio.onerror = () => {
        if (this.activeAudio === audio) {
          this.activeAudio = null;
        }
        resolve(false);
      };

      audio.play().catch(() => {
        resolve(false);
      });
    });
  }

  /**
   * Speaks using browser SpeechSynthesis with high-quality female neural/natural voice targeting.
   */
  private async speakNativeFallback(text: string): Promise<void> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterance = utterance;

    // Filter and assign the best female voice available
    const voices = synth.getVoices() || [];
    const bestVoice = this.getBestFallbackFemaleVoice(voices);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    // Tuning for a soothing, empathetic tone
    utterance.rate = 0.92; // Slightly slower, calm cadence
    utterance.pitch = 1.0; // Natural pitch
    utterance.volume = 0.9;

    return new Promise<void>((resolve) => {
      let isSettled = false;
      const finish = () => {
        if (!isSettled) {
          isSettled = true;
          if (this.activeUtterance === utterance) {
            this.activeUtterance = null;
          }
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;

      synth.speak(utterance);

      // Safety timeout in case browser speech engine hangs
      setTimeout(finish, Math.max(3000, text.length * 120));
    });
  }

  /**
   * Intelligently selects the highest quality soothing female voice from the OS/Chromium engine.
   */
  private getBestFallbackFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    if (!voices || voices.length === 0) return null;

    const englishVoices = voices.filter((v) => (v.lang || '').toLowerCase().startsWith('en'));
    const pool = englishVoices.length > 0 ? englishVoices : voices;

    let bestVoice: SpeechSynthesisVoice | null = null;
    let bestScore = -1000;

    for (const v of pool) {
      const name = (v.name || '').toLowerCase();
      let score = 0;

      // Reject legacy robotic voices
      for (const blocked of ROBOTIC_VOICE_BLACKLIST) {
        if (name.includes(blocked)) {
          score -= 500;
          break;
        }
      }

      // Priority matching for natural / neural voices
      for (let i = 0; i < PREFERRED_FALLBACK_VOICE_KEYWORDS.length; i++) {
        const kw = PREFERRED_FALLBACK_VOICE_KEYWORDS[i];
        if (name.includes(kw)) {
          score += 100 - i * 4;
          break;
        }
      }

      if (name.includes('female') || name.includes('girl')) {
        score += 30;
      }

      if (v.localService) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestVoice = v;
      }
    }

    return bestVoice;
  }

  /**
   * Immediately stops any active audio playback or synthesis.
   */
  public cancel(): void {
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch {}
      this.activeAudio = null;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      } catch {}
      this.activeUtterance = null;
    }

    this.setSpeaking(false);
  }

  public stop(): void {
    this.cancel();
  }

  public isSpeaking(): boolean {
    return this.isCurrentlySpeaking;
  }

  public subscribeSpeaking(listener: (speaking: boolean) => void): () => void {
    this.speakingListeners.add(listener);
    return () => {
      this.speakingListeners.delete(listener);
    };
  }

  private setSpeaking(val: boolean): void {
    if (this.isCurrentlySpeaking !== val) {
      this.isCurrentlySpeaking = val;
      this.speakingListeners.forEach((fn) => fn(val));
    }
  }

  public setDefaultVoice(voice: string): void {
    this.defaultVoice = voice;
  }

  public getDefaultVoice(): string {
    return this.defaultVoice;
  }

  public getSecondaryVoices(): string[] {
    return [...SECONDARY_EDGE_VOICES];
  }
}

export const ttsService = new TtsService();
