import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Eye,
  Ruler,
  Bell,
  Clock,
  Activity,
  Gauge,
  FileDown,
  Grid,
  TrendingUp,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
  X,
  CheckCircle2,
  Download,
  ChevronDown,
  ChevronUp,
  Volume2,
  Mic,
  MicOff,
  Plus,
  PanelLeft,
  PanelLeftClose,
  Search,
  Trash2,
  Pencil,
  MoreHorizontal,
  Check,
  MessageSquarePlus,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ActiveTab,
  TelemetryState,
  ChatMessage,
  RetisChatSession,
  RetisMetricId,
  RetisConnectionState,
  RetisSuggestedAction,
} from '../types';
import {
  buildSharedTelemetrySnapshot,
  buildFreshLiveSnapshotFromStore,
  LiveTelemetryStore,
  RetisTelemetryDiagnostics,
  sanitizeHistoryTurnToTokens,
  substituteSnapshotTokens,
  validateRetisStructuredResponse,
  ALLOWED_RETIS_METRIC_IDS,
} from '../services/retisSnapshot';
import {
  RETIS_MAX_HISTORY_TURNS,
  RETIS_OUT_OF_SCOPE_REDIRECT_TEXT,
} from '../constants/retisSystemInstruction';
import {
  RetisChatHistoryStorage,
  deriveChatTitleFromMessage,
} from '../services/retisChatHistoryStorage';
import { generateRetisMonthlyPdfBytes } from '../services/retisPdfGenerator';
import { useTheme } from '../context/ThemeContext';
import { AnimatedNumber } from './ui/AnimatedNumber';
import {
  SpeechRecognitionController,
  MicVolumeMeter,
  RetisLiveVoiceClient,
  playRetisSpokenReply,
  stopActiveRetisSpeechPlayback,
  unlockRetisPlaybackAudioContext,
  RetisVoiceSessionStatus,
  HIDDEN_WINDOW_TIMEOUT_MS,
  MAX_QUEUED_VOICE_MESSAGES,
  START_TIMEOUT_MS,
  NO_SOUND_HINT_MS,
  NO_TRANSCRIPT_HINT_MS,
  THINKING_TIMEOUT_CAP_MS,
  RetisVoiceDiagnostics,
  matchRetisLocalFastPathIntent,
  loadRetisCaptionsEnabledPreference,
  saveRetisCaptionsEnabledPreference,
  computeWordTimings,
  CAPTION_HOLD_DURATION_MS,
  CAPTION_SHORT_MIN_HOLD_MS,
  CAPTION_READING_WORDS_PER_SEC,
  RETIS_VOICE_HISTORY_TURNS,
  streamRetisChatAndVoice,
} from '../services/retisVoiceService';

const RETIS_MASCOT_SRC = '/assets/aistudio/Iris_AI__Logo___5__2a009c4f.png';
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Word-group progressive reveal for a newly generated live reply.
 * Reveals in 3-4 word groups completing in <= 600ms total.
 * Pressing any key, clicking, or pressing Escape finishes the reveal immediately.
 * Saved historical messages never run this animation.
 */
const WordGroupRevealText: React.FC<{
  text: string;
  animate: boolean;
  onComplete?: () => void;
}> = ({ text, animate, onComplete }) => {
  const groups = useMemo(() => {
    const tokens = text.split(/(\s+)/);
    const chunks: string[] = [];
    let current = '';
    let wordCount = 0;
    for (const tok of tokens) {
      current += tok;
      if (tok.trim().length > 0) {
        wordCount++;
        if (wordCount >= 4) {
          chunks.push(current);
          current = '';
          wordCount = 0;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }, [text]);

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const shouldAnimate = animate && !prefersReducedMotion && groups.length > 1;
  const [visibleCount, setVisibleCount] = useState<number>(() =>
    shouldAnimate ? 1 : groups.length
  );

  const hasCalledCompleteRef = useRef(false);

  const finishImmediately = useCallback(() => {
    setVisibleCount(groups.length);
    if (!hasCalledCompleteRef.current) {
      hasCalledCompleteRef.current = true;
      onComplete?.();
    }
  }, [groups.length, onComplete]);

  useEffect(() => {
    if (!shouldAnimate) {
      setVisibleCount(groups.length);
      return;
    }
    if (visibleCount >= groups.length) {
      if (!hasCalledCompleteRef.current) {
        hasCalledCompleteRef.current = true;
        onComplete?.();
      }
      return;
    }
    // Cap total reveal duration at <= 160ms for snappy, fast replies
    const stepMs = Math.max(8, Math.min(16, Math.floor(160 / Math.max(1, groups.length))));
    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(groups.length, prev + 1));
    }, stepMs);
    return () => window.clearTimeout(timer);
  }, [shouldAnimate, visibleCount, groups.length, onComplete]);

  useEffect(() => {
    if (!shouldAnimate || visibleCount >= groups.length) return;
    const handleSkip = () => {
      finishImmediately();
    };
    window.addEventListener('keydown', handleSkip, { once: true });
    return () => window.removeEventListener('keydown', handleSkip);
  }, [shouldAnimate, visibleCount, groups.length, finishImmediately]);

  if (!shouldAnimate || visibleCount >= groups.length) {
    return <>{text}</>;
  }

  return (
    <span onClick={finishImmediately} className="cursor-pointer" title="Click to reveal immediately">
      {groups.slice(0, visibleCount).map((chunk, idx) => (
        <span key={idx} className="retis-word-chunk">
          {chunk}
        </span>
      ))}
    </span>
  );
};

interface RetisScreenProps {
  telemetry: TelemetryState;
  onSelectTab: (tab: ActiveTab) => void;
  onOpenBreakModal: () => void;
  onOpenPreferences: () => void;
  userName?: string;
  isMonitoring?: boolean;
  cameraStatus?: string;
  cameraError?: string;
  onOpenCalibration?: () => void;
}

type ActiveActionModal = 'none' | 'report' | 'heatmap' | 'trends';

export const RetisScreen: React.FC<RetisScreenProps> = ({
  telemetry,
  onSelectTab,
  onOpenBreakModal,
  onOpenPreferences,
  userName = 'Hinta Suresh',
  isMonitoring = false,
  cameraStatus = 'idle',
  cameraError,
  onOpenCalibration,
}) => {
  const { isMinimal, isDark, accentColor, accentTextColor } = useTheme();

  // Shared authoritative selector — identical code path as DashboardScreen
  const snapshot = buildSharedTelemetrySnapshot(
    telemetry,
    isMonitoring,
    cameraStatus,
    cameraError
  );

  const firstName = userName.trim().split(/\s+/)[0] || 'there';

  // Persisted Chat History state (30-day retention policy)
  const initialHistoryLoad = useMemo(() => RetisChatHistoryStorage.loadSessions(), []);
  const [savedSessions, setSavedSessions] = useState<RetisChatSession[]>(
    initialHistoryLoad.sessions
  );
  const [storageAvailable, setStorageAvailable] = useState<boolean>(
    initialHistoryLoad.storageAvailable
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(() =>
    RetisChatHistoryStorage.loadPanelOpenState(false)
  );
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [confirmClearAllHistory, setConfirmClearAllHistory] = useState(false);

  // View state: 'home' vs 'conversation'
  const [viewMode, setViewMode] = useState<'home' | 'conversation'>('home');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isPending, setIsPending] = useState(false);

  // Menus & popovers
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const [isSnapshotPopoverOpen, setIsSnapshotPopoverOpen] = useState(false);
  const [isConvOverflowOpen, setIsConvOverflowOpen] = useState(false);
  const [expandedDataNotesIds, setExpandedDataNotesIds] = useState<Record<string, boolean>>({});

  // Thread scroll state for smart auto-scroll vs "Jump to latest" button
  const [isThreadNearBottom, setIsThreadNearBottom] = useState(true);
  const shouldForceScrollRef = useRef(false);

  // Connection state: 'not_configured' | 'connected' | 'offline' | 'error' | 'standby'
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [hasSucceededRequest, setHasSucceededRequest] = useState(false);
  const [lastRequestHadError, setLastRequestHadError] = useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Persistent Voice Mode (voiceArmed) State
  const [voiceArmed, setVoiceArmed] = useState(false);
  const voiceArmedRef = useRef(false);
  const [isVoiceMuted, setIsVoiceMuted] = useState(false);
  const isVoiceMutedRef = useRef(false);
  const [isReconnectingMic, setIsReconnectingMic] = useState(false);
  const [voiceSessionStatus, setVoiceSessionStatus] = useState<RetisVoiceSessionStatus>('idle');
  const voiceSessionStatusRef = useRef<RetisVoiceSessionStatus>('idle');
  const armAttemptIdRef = useRef(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [outputVolume, setOutputVolume] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [voiceBlockedReason, setVoiceBlockedReason] = useState<string | null>(() => {
    const ctrl = SpeechRecognitionController.getInstance();
    return RetisLiveVoiceClient.isSupported() || ctrl.isSupported()
      ? null
      : 'Voice input is not supported in this browser';
  });
  const [voiceAnnouncement, setVoiceAnnouncement] = useState('');
  const [voiceDiagnosticHint, setVoiceDiagnosticHint] = useState<string | null>(null);
  const [queuedVoiceMessages, setQueuedVoiceMessages] = useState<string[]>([]);
  const [isLiveVoiceConnected, setIsLiveVoiceConnected] = useState(false);

  // Live Captions & Word-by-Word Reveal State for Voice Mode
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(() =>
    loadRetisCaptionsEnabledPreference()
  );
  const [activeReplyText, setActiveReplyText] = useState('');
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [totalReplyWords, setTotalReplyWords] = useState(0);
  const [isReplyHolding, setIsReplyHolding] = useState(false);
  const [isReplyInterruptedFreeze, setIsReplyInterruptedFreeze] = useState(false);
  const [isReplyFadingOut, setIsReplyFadingOut] = useState(false);
  const [activeReplyMetrics, setActiveReplyMetrics] = useState<
    Array<{ id: RetisMetricId; label: string; value: string }>
  >([]);
  const [activeReplyPeriodLabel, setActiveReplyPeriodLabel] = useState('');
  const [activeReplyObservedLabel, setActiveReplyObservedLabel] = useState('');
  const [activeReplySource, setActiveReplySource] = useState<'local' | 'model' | null>(null);

  // Voice & audio refs
  const stopSpeechPlaybackRef = useRef<(() => void) | null>(null);
  const micMeterRef = useRef<MicVolumeMeter | null>(null);
  const recControllerRef = useRef<SpeechRecognitionController | null>(null);
  const liveVoiceClientRef = useRef<RetisLiveVoiceClient | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const hiddenWindowTimerRef = useRef<number | null>(null);
  const captionWordTimerRef = useRef<number | null>(null);
  const captionHoldTimerRef = useRef<number | null>(null);
  const captionFadeTimerRef = useRef<number | null>(null);
  const interruptFreezeTimerRef = useRef<number | null>(null);
  const orbSettleTimerRef = useRef<number | null>(null);
  const noSoundWatchdogTimerRef = useRef<number | null>(null);
  const soundWithoutTranscriptSinceMsRef = useRef<number | null>(null);
  const hasReceivedTranscriptThisWindowRef = useRef(false);
  const activeVoiceAssistantMsgIdRef = useRef<string | null>(null);
  const isPendingRef = useRef(isPending);

  const clearAcousticWatchdogTimers = useCallback(() => {
    if (noSoundWatchdogTimerRef.current !== null) {
      window.clearTimeout(noSoundWatchdogTimerRef.current);
      noSoundWatchdogTimerRef.current = null;
    }
    soundWithoutTranscriptSinceMsRef.current = null;
  }, []);

  const armNoSoundWatchdogTimer = useCallback(() => {
    if (noSoundWatchdogTimerRef.current !== null) {
      window.clearTimeout(noSoundWatchdogTimerRef.current);
      noSoundWatchdogTimerRef.current = null;
    }
    noSoundWatchdogTimerRef.current = window.setTimeout(() => {
      noSoundWatchdogTimerRef.current = null;
      if (
        voiceArmedRef.current &&
        !isVoiceMutedRef.current &&
        !isPendingRef.current &&
        !stopSpeechPlaybackRef.current &&
        voiceSessionStatusRef.current === 'listening'
      ) {
        const hint = "I can't hear anything. Check your microphone.";
        RetisVoiceDiagnostics.record('no_sound_hint', { afterMs: NO_SOUND_HINT_MS });
        setVoiceDiagnosticHint((prev) => prev || hint);
      }
    }, NO_SOUND_HINT_MS);
  }, []);

  const clearCaptionTimers = useCallback(() => {
    if (captionWordTimerRef.current !== null) {
      window.clearInterval(captionWordTimerRef.current);
      captionWordTimerRef.current = null;
    }
    if (captionHoldTimerRef.current !== null) {
      window.clearTimeout(captionHoldTimerRef.current);
      captionHoldTimerRef.current = null;
    }
    if (captionFadeTimerRef.current !== null) {
      window.clearTimeout(captionFadeTimerRef.current);
      captionFadeTimerRef.current = null;
    }
    if (interruptFreezeTimerRef.current !== null) {
      window.clearTimeout(interruptFreezeTimerRef.current);
      interruptFreezeTimerRef.current = null;
    }
  }, []);

  const resetVoiceCaptionState = useCallback(() => {
    clearCaptionTimers();
    setActiveReplyText('');
    setActiveWordIndex(0);
    setTotalReplyWords(0);
    setIsReplyHolding(false);
    setIsReplyInterruptedFreeze(false);
    setIsReplyFadingOut(false);
    setActiveReplyMetrics([]);
    setActiveReplySource(null);
    activeVoiceAssistantMsgIdRef.current = null;
  }, [clearCaptionTimers]);

  const handleToggleCaptions = useCallback(() => {
    setCaptionsEnabled((prev) => {
      const next = !prev;
      saveRetisCaptionsEnabledPreference(next);
      return next;
    });
  }, []);

  const updateVoiceSessionStatus = useCallback((next: RetisVoiceSessionStatus) => {
    const prev = voiceSessionStatusRef.current;
    if (prev !== next && voiceArmedRef.current) {
      RetisVoiceDiagnostics.record('state_transition', { from: prev, to: next });
    }
    voiceSessionStatusRef.current = next;
    setVoiceSessionStatus(next);
  }, []);

  useEffect(() => {
    isPendingRef.current = isPending;
  }, [isPending]);

  // Authoritative live telemetry refs & store synchronization for fresh snapshot generation at message send time
  const telemetryRef = useRef(telemetry);
  const isMonitoringRef = useRef(isMonitoring);
  const cameraStatusRef = useRef(cameraStatus);
  const cameraErrorRef = useRef(cameraError);
  const lastSentLiveSignatureRef = useRef<string>('');

  useEffect(() => {
    telemetryRef.current = telemetry;
    isMonitoringRef.current = isMonitoring;
    cameraStatusRef.current = cameraStatus;
    cameraErrorRef.current = cameraError;
    LiveTelemetryStore.update(telemetry, isMonitoring, cameraStatus, cameraError);

    if (liveVoiceClientRef.current && liveVoiceClientRef.current.isConnected()) {
      const freshLiveSnapshot = buildFreshLiveSnapshotFromStore(
        telemetry,
        isMonitoring,
        cameraStatus,
        cameraError
      );
      const m = freshLiveSnapshot.llmPayload.metrics;
      const sig = [
        freshLiveSnapshot.llmPayload.monitoringStatusLabel,
        m.blink_rate_bpm?.formatted,
        m.screen_distance_cm?.formatted,
        m.validated_blinks?.formatted,
        m.calibration_status?.formatted,
        m.blink_alerts?.formatted,
        m.distance_warnings?.formatted,
        m.completed_breaks?.formatted,
        m.fatigue_score?.formatted,
      ].join('|');
      if (sig !== lastSentLiveSignatureRef.current) {
        lastSentLiveSignatureRef.current = sig;
        liveVoiceClientRef.current.sendTelemetrySnapshot(freshLiveSnapshot.llmPayload);
      }
    }
  }, [telemetry, isMonitoring, cameraStatus, cameraError]);

  // Active action modal ('none' | 'report' | 'heatmap' | 'trends')
  const [activeModal, setActiveModal] = useState<ActiveActionModal>('none');
  const [heatmapMetric, setHeatmapMetric] = useState<'low_blink' | 'distance_warnings'>('low_blink');
  const [trendsMetricFilter, setTrendsMetricFilter] = useState<
    'all' | 'blink_rate' | 'distance_warnings' | 'total_blinks'
  >('all');

  // PDF Report state
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfAiNarrative, setPdfAiNarrative] = useState<string | null>(null);
  const [isGeneratingNarrative, setIsGeneratingNarrative] = useState(false);
  const [lastDownloadedFilename, setLastDownloadedFilename] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutIdRef = useRef<number | null>(null);
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const plusMenuRef = useRef<HTMLDivElement | null>(null);
  const snapshotPopoverRef = useRef<HTMLDivElement | null>(null);
  const convOverflowRef = useRef<HTMLDivElement | null>(null);

  // Persist history panel open/collapsed state
  const toggleHistoryPanel = useCallback((nextState?: boolean) => {
    setIsHistoryOpen((prev) => {
      const resolved = typeof nextState === 'boolean' ? nextState : !prev;
      RetisChatHistoryStorage.savePanelOpenState(resolved);
      return resolved;
    });
  }, []);

  // Capture a frozen dictionary of snapshot metrics so historical messages always retain their exact creation values
  const captureFrozenMetrics = useCallback(
    (targetSnapshot = snapshot): Record<string, { label: string; value: string }> => {
      const frozen: Record<string, { label: string; value: string }> = {};
      for (const id of ALLOWED_RETIS_METRIC_IDS) {
        const entry = targetSnapshot.metricEntries[id];
        if (entry) {
          const val =
            entry.state === 'uncalibrated'
              ? 'Uncalibrated'
              : entry.rawValue === null ||
                entry.state === 'no_data' ||
                entry.state === 'insufficient_data'
              ? 'Unavailable'
              : entry.formattedValue;
          frozen[id] = {
            label: entry.label,
            value: val,
          };
        }
      }
      return frozen;
    },
    [snapshot]
  );

  // Persist messages into the active session whenever messages change in a conversation
  useEffect(() => {
    if (messages.length === 0) return;
    const nowIso = new Date().toISOString();
    const firstUserMsg = messages.find((m) => m.role === 'user');
    const derivedTitle = deriveChatTitleFromMessage(firstUserMsg?.content || 'Screen habits report');

    const targetId = activeSessionId || `chat-${Date.now()}`;
    if (!activeSessionId) {
      setActiveSessionId(targetId);
    }

    setSavedSessions((prev) => {
      const existing = prev.find((s) => s.id === targetId);
      const sessionToSave: RetisChatSession = {
        id: targetId,
        title: existing ? existing.title : derivedTitle,
        createdAt: existing ? existing.createdAt : nowIso,
        updatedAt: nowIso,
        messages,
      };
      const result = RetisChatHistoryStorage.upsertSession(prev, sessionToSave, userName);
      setStorageAvailable(result.storageAvailable);
      return result.sessions;
    });
  }, [messages, activeSessionId, userName]);

  // Check online/offline and server API key status
  useEffect(() => {
    const handleOnline = () => setIsBrowserOnline(true);
    const handleOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let cancelled = false;
    fetch('/api/retis-status')
      .then((res) => (res.ok ? res.json() : { configured: false }))
      .then((data) => {
        if (!cancelled) {
          setServerConfigured(Boolean(data?.configured));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerConfigured(false);
        }
      });

    return () => {
      cancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close menus/popovers on Escape or outside click
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsPlusMenuOpen(false);
        setIsSnapshotPopoverOpen(false);
        setIsConvOverflowOpen(false);
        setRenamingSessionId(null);
        setConfirmDeleteSessionId(null);
        setConfirmClearAllHistory(false);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (plusMenuRef.current && !plusMenuRef.current.contains(target)) {
        setIsPlusMenuOpen(false);
      }
      if (snapshotPopoverRef.current && !snapshotPopoverRef.current.contains(target)) {
        setIsSnapshotPopoverOpen(false);
      }
      if (convOverflowRef.current && !convOverflowRef.current.contains(target)) {
        setIsConvOverflowOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  const showVoiceNotice = useCallback((msg: string | null, autoDismissMs?: number) => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    setVoiceNotice(msg);
    if (msg && autoDismissMs && autoDismissMs > 0) {
      noticeTimerRef.current = window.setTimeout(() => {
        noticeTimerRef.current = null;
        setVoiceNotice((current) => (current === msg ? null : current));
      }, autoDismissMs);
    }
  }, []);

  // Stop any active speech playback immediately and resume recognition if voice is armed
  const stopSpeechPlayback = useCallback(() => {
    if (liveVoiceClientRef.current) {
      liveVoiceClientRef.current.stopScheduledOutputAudio();
    }
    if (stopSpeechPlaybackRef.current) {
      stopSpeechPlaybackRef.current();
      stopSpeechPlaybackRef.current = null;
    }
    stopActiveRetisSpeechPlayback();
    setOutputVolume(0);
    if (recControllerRef.current) {
      recControllerRef.current.setEchoSuppressionText(null);
    }
    if (voiceArmedRef.current && recControllerRef.current && !isVoiceMutedRef.current) {
      recControllerRef.current.resumeAfterSpeechOutput();
      if (!isPendingRef.current) {
        updateVoiceSessionStatus('listening');
      }
    }
  }, [updateVoiceSessionStatus]);

  // Disarm persistent voice input and release all microphone, Live API WebSocket, recognition, and TTS resources immediately
  const disarmVoiceInput = useCallback(
    (reasonNotice?: string, isErrorState = false) => {
      armAttemptIdRef.current += 1;
      const wasArmed =
        voiceArmedRef.current ||
        voiceSessionStatusRef.current === 'requesting_permission';
      voiceArmedRef.current = false;
      setVoiceArmed(false);
      isVoiceMutedRef.current = false;
      setIsVoiceMuted(false);
      setIsReconnectingMic(false);
      setIsLiveVoiceConnected(false);
      setInterimTranscript('');
      setVoiceDiagnosticHint(null);
      setMicVolume(0);
      setOutputVolume(0);
      setQueuedVoiceMessages([]);
      clearAcousticWatchdogTimers();
      resetVoiceCaptionState();
      updateVoiceSessionStatus(isErrorState ? 'error' : 'idle');

      if (hiddenWindowTimerRef.current !== null) {
        window.clearTimeout(hiddenWindowTimerRef.current);
        hiddenWindowTimerRef.current = null;
      }

      if (liveVoiceClientRef.current) {
        liveVoiceClientRef.current.disconnect();
        liveVoiceClientRef.current = null;
      }

      if (stopSpeechPlaybackRef.current) {
        stopSpeechPlaybackRef.current();
        stopSpeechPlaybackRef.current = null;
      }
      stopActiveRetisSpeechPlayback();

      if (micMeterRef.current) {
        micMeterRef.current.stop();
        micMeterRef.current = null;
      }
      if (recControllerRef.current) {
        recControllerRef.current.disarm();
      }

      if (wasArmed) {
        RetisVoiceDiagnostics.record('voice_close', { isErrorState });
        setVoiceAnnouncement('Voice mode off');
      }
      if (reasonNotice) {
        showVoiceNotice(reasonNotice);
      }
    },
    [clearAcousticWatchdogTimers, resetVoiceCaptionState, showVoiceNotice, updateVoiceSessionStatus]
  );

  // Clean up any active request, speech playback, timers, Live API session, or recognition on unmount
  useEffect(() => {
    return () => {
      armAttemptIdRef.current += 1;
      voiceArmedRef.current = false;
      clearAcousticWatchdogTimers();
      clearCaptionTimers();
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
      if (hiddenWindowTimerRef.current !== null) {
        window.clearTimeout(hiddenWindowTimerRef.current);
      }
      if (liveVoiceClientRef.current) {
        liveVoiceClientRef.current.disconnect();
        liveVoiceClientRef.current = null;
      }
      if (micMeterRef.current) {
        micMeterRef.current.stop();
        micMeterRef.current = null;
      }
      if (recControllerRef.current) {
        recControllerRef.current.disarm();
      }
      if (stopSpeechPlaybackRef.current) {
        stopSpeechPlaybackRef.current();
        stopSpeechPlaybackRef.current = null;
      }
      stopActiveRetisSpeechPlayback();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('unmount');
      }
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
      }
    };
  }, [clearCaptionTimers]);

  // Auto-disarm if window is hidden/minimized for more than 30 seconds
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!voiceArmedRef.current) return;
      if (document.visibilityState === 'hidden') {
        if (hiddenWindowTimerRef.current !== null) {
          window.clearTimeout(hiddenWindowTimerRef.current);
        }
        hiddenWindowTimerRef.current = window.setTimeout(() => {
          hiddenWindowTimerRef.current = null;
          if (document.visibilityState === 'hidden' && voiceArmedRef.current) {
            disarmVoiceInput('Voice input turned off while the window was hidden.');
          }
        }, HIDDEN_WINDOW_TIMEOUT_MS);
      } else {
        if (hiddenWindowTimerRef.current !== null) {
          window.clearTimeout(hiddenWindowTimerRef.current);
          hiddenWindowTimerRef.current = null;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [disarmVoiceInput]);


  // Auto-grow textarea between 1 and 6 lines (~40px to ~144px), then scroll internally
  const syncTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const nextHeight = Math.min(Math.max(el.scrollHeight, 42), 144);
    el.style.height = `${nextHeight}px`;
  }, []);

  useEffect(() => {
    syncTextareaHeight();
  }, [inputQuery, syncTextareaHeight]);

  // Track whether user is near the bottom of the thread container
  const handleThreadScroll = useCallback(() => {
    const el = threadContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsThreadNearBottom(distanceFromBottom <= 80);
  }, []);

  const scrollToLatestMessage = useCallback(() => {
    const el = threadContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setIsThreadNearBottom(true);
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  // Auto-scroll to newest message ONLY when user is near the bottom or just sent a message
  useEffect(() => {
    if (viewMode === 'conversation' && (isThreadNearBottom || shouldForceScrollRef.current)) {
      shouldForceScrollRef.current = false;
      scrollToLatestMessage();
    }
  }, [messages, isPending, viewMode, isThreadNearBottom, scrollToLatestMessage]);

  const connectionState: RetisConnectionState = !isBrowserOnline
    ? 'offline'
    : serverConfigured === false
    ? 'not_configured'
    : lastRequestHadError
    ? 'error'
    : isLiveVoiceConnected
    ? 'live_voice'
    : hasSucceededRequest
    ? 'connected'
    : 'standby';

  const connectionBadgeLabel: Record<RetisConnectionState, string> = {
    live_voice: 'Connected',
    connected: 'Connected',
    standby: 'Connected',
    not_configured: 'Not configured',
    offline: 'Offline',
    error: 'Connection error',
  };

  // Primary 3 rectangular suggestion cards (Home state & Out-of-Scope redirect card)
  const primarySuggestionCards: Array<{
    label: string;
    query: string;
    metricId: RetisMetricId;
    vividBg: string;
  }> = [
    {
      label: 'Blink Rate',
      query:
        'What is my current average blink rate, and how does it compare to the 14–18 BPM target range?',
      metricId: 'blink_rate_bpm',
      vividBg: 'bg-[#C77DFF]',
    },
    {
      label: 'Screen Distance',
      query:
        'What is my average screen distance right now, and is it within the 38–65 cm optimal zone?',
      metricId: 'screen_distance_cm',
      vividBg: 'bg-[#25D6C1]',
    },
    {
      label: 'Alerts Summary',
      query: 'How many blink alerts and distance warnings were delivered today?',
      metricId: 'blink_alerts_count',
      vividBg: 'bg-[#FF851B]',
    },
  ];

  // Secondary suggestions inside the + menu
  const secondaryPlusSuggestions: Array<{
    label: string;
    query: string;
    metricId: RetisMetricId;
  }> = [
    {
      label: 'Break Routines',
      query:
        'How do the 2-minute break routines work, and how many breaks have I completed today?',
      metricId: 'completed_breaks_count',
    },
    {
      label: 'Session Load',
      query: 'What is my current fatigue score and longest continuous session today?',
      metricId: 'fatigue_score',
    },
  ];

  const handleCancelRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('user_cancelled');
      abortControllerRef.current = null;
    }
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    setIsPending(false);
    if (voiceArmedRef.current) {
      updateVoiceSessionStatus('listening');
    }
  }, [updateVoiceSessionStatus]);

  const handleStartNewChat = useCallback(() => {
    handleCancelRequest();
    setActiveSessionId(null);
    setMessages([]);
    setInputQuery('');
    setLastRequestHadError(false);
    setIsPlusMenuOpen(false);
    setIsConvOverflowOpen(false);
    setViewMode('home');
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 20);
  }, [handleCancelRequest]);

  const handleSelectSavedSession = useCallback(
    (session: RetisChatSession) => {
      handleCancelRequest();
      setActiveSessionId(session.id);
      // Clear isFreshReply on loaded historical messages so word reveal never replays
      setMessages(session.messages.map((m) => ({ ...m, isFreshReply: false })));
      setLastRequestHadError(false);
      setIsPlusMenuOpen(false);
      setIsConvOverflowOpen(false);
      shouldForceScrollRef.current = true;
      setViewMode('conversation');
      if (typeof window !== 'undefined' && window.innerWidth < 1100) {
        toggleHistoryPanel(false);
      }
    },
    [handleCancelRequest, toggleHistoryPanel]
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setSavedSessions((prev) => {
        const res = RetisChatHistoryStorage.deleteSession(prev, sessionId, userName);
        setStorageAvailable(res.storageAvailable);
        return res.sessions;
      });
      setConfirmDeleteSessionId(null);
      setIsConvOverflowOpen(false);
      if (activeSessionId === sessionId) {
        handleStartNewChat();
      }
    },
    [activeSessionId, handleStartNewChat, userName]
  );

  const handleRenameSession = useCallback(
    (sessionId: string) => {
      if (!renameDraft.trim()) {
        setRenamingSessionId(null);
        return;
      }
      setSavedSessions((prev) => {
        const res = RetisChatHistoryStorage.renameSession(prev, sessionId, renameDraft, userName);
        setStorageAvailable(res.storageAvailable);
        return res.sessions;
      });
      setRenamingSessionId(null);
      setRenameDraft('');
    },
    [renameDraft, userName]
  );

  const handleClearAllSessions = useCallback(() => {
    const res = RetisChatHistoryStorage.clearAllSessions();
    setSavedSessions(res.sessions);
    setStorageAvailable(res.storageAvailable);
    setConfirmClearAllHistory(false);
    handleStartNewChat();
  }, [handleStartNewChat]);

  // Schedule 4s hold (min 2s for short replies) and 260ms fade-out after last caption word is revealed
  const scheduleVoiceCaptionHoldAndFade = useCallback(
    (wordCount: number) => {
      if (captionWordTimerRef.current !== null) {
        window.clearInterval(captionWordTimerRef.current);
        captionWordTimerRef.current = null;
      }
      if (captionHoldTimerRef.current !== null) {
        window.clearTimeout(captionHoldTimerRef.current);
        captionHoldTimerRef.current = null;
      }
      if (captionFadeTimerRef.current !== null) {
        window.clearTimeout(captionFadeTimerRef.current);
        captionFadeTimerRef.current = null;
      }

      setActiveWordIndex(Math.max(0, wordCount - 1));
      setIsReplyHolding(true);

      const holdMs = wordCount <= 8 ? CAPTION_SHORT_MIN_HOLD_MS : CAPTION_HOLD_DURATION_MS;
      captionHoldTimerRef.current = window.setTimeout(() => {
        captionHoldTimerRef.current = null;
        setIsReplyFadingOut(true);
        captionFadeTimerRef.current = window.setTimeout(() => {
          captionFadeTimerRef.current = null;
          setActiveReplyText('');
          setActiveWordIndex(0);
          setTotalReplyWords(0);
          setIsReplyHolding(false);
          setIsReplyFadingOut(false);
          setActiveReplyMetrics([]);
          setActiveReplySource(null);
          activeVoiceAssistantMsgIdRef.current = null;
        }, 260);
      }, holdMs);
    },
    []
  );

  // Start presenting an assistant reply in Voice Mode (live word-by-word captions + reading-pace fallback + spoken TTS)
  const startVoiceReplyPresentation = useCallback(
    (
      messageId: string,
      resolvedText: string,
      metricsUsed: RetisMetricId[],
      frozenAtSend: Record<string, { label: string; value: string }>,
      periodLabel: string,
      observedLabel: string,
      source: 'local' | 'model',
      shouldSpeakAloud: boolean
    ) => {
      clearCaptionTimers();
      activeVoiceAssistantMsgIdRef.current = messageId;

      const { timings } = computeWordTimings(resolvedText, 1000);
      const wordCount = Math.max(1, timings.length);

      const chips: Array<{ id: RetisMetricId; label: string; value: string }> = [];
      for (const mId of metricsUsed) {
        const frozenItem = frozenAtSend[mId];
        const entry = snapshot.metricEntries[mId];
        if (frozenItem || entry) {
          chips.push({
            id: mId,
            label: frozenItem ? frozenItem.label : entry.label,
            value: frozenItem ? frozenItem.value : entry.formattedValue,
          });
        }
      }

      setActiveReplyText(resolvedText);
      setActiveWordIndex(0);
      setTotalReplyWords(wordCount);
      setIsReplyHolding(false);
      setIsReplyInterruptedFreeze(false);
      setIsReplyFadingOut(false);
      setActiveReplyMetrics(chips);
      setActiveReplyPeriodLabel(periodLabel);
      setActiveReplyObservedLabel(observedLabel);
      setActiveReplySource(source);

      // Reading-pace fallback timer (3.5 words/sec) so words always reveal even if audio is muted/blocked/unsupported
      const stepMs = Math.max(120, Math.round(1000 / CAPTION_READING_WORDS_PER_SEC));
      captionWordTimerRef.current = window.setInterval(() => {
        setActiveWordIndex((prev) => {
          const next = prev + 1;
          if (next >= wordCount - 1) {
            if (captionWordTimerRef.current !== null) {
              window.clearInterval(captionWordTimerRef.current);
              captionWordTimerRef.current = null;
            }
            if (!shouldSpeakAloud || !stopSpeechPlaybackRef.current) {
              scheduleVoiceCaptionHoldAndFade(wordCount);
            }
            return wordCount - 1;
          }
          return next;
        });
      }, stepMs);

      if (shouldSpeakAloud) {
        if (recControllerRef.current) {
          recControllerRef.current.setEchoSuppressionText(resolvedText);
        }
        updateVoiceSessionStatus('speaking');
        stopSpeechPlaybackRef.current = playRetisSpokenReply(resolvedText, {
          onStart: () => {
            if (voiceArmedRef.current) {
              updateVoiceSessionStatus('speaking');
            }
          },
          onOutputLevel: (lvl) => {
            setOutputVolume(lvl);
          },
          onWordBoundary: (wordIndex, totalWords) => {
            setTotalReplyWords(totalWords);
            setActiveWordIndex((prev) => Math.max(prev, wordIndex));
          },
          onEnd: () => {
            stopSpeechPlaybackRef.current = null;
            setOutputVolume(0);
            if (recControllerRef.current) {
              recControllerRef.current.setEchoSuppressionText(null);
            }
            scheduleVoiceCaptionHoldAndFade(wordCount);
            if (voiceArmedRef.current && !isVoiceMutedRef.current) {
              if (recControllerRef.current) {
                recControllerRef.current.resumeAfterSpeechOutput();
              }
              if (!isPendingRef.current) {
                updateVoiceSessionStatus('listening');
              }
            }
          },
          onError: (audioErrMsg) => {
            setOutputVolume(0);
            showVoiceNotice(audioErrMsg, 4000);
          },
        });
      } else {
        if (voiceArmedRef.current && !isVoiceMutedRef.current) {
          updateVoiceSessionStatus('listening');
        }
      }
    },
    [
      clearCaptionTimers,
      scheduleVoiceCaptionHoldAndFade,
      showVoiceNotice,
      snapshot.metricEntries,
      updateVoiceSessionStatus,
    ]
  );

  // Barge-In Interruption Handler: stops speech within <=150ms, aborts in-flight requests, marks message interrupted,
  // freezes caption at 35% opacity for 300ms, and snaps orb to Listening within 1 frame.
  const handleBargeInInterruption = useCallback(
    (bargeInTranscript?: string) => {
      if (!voiceArmedRef.current || isVoiceMutedRef.current) return;

      const isCurrentlySpeakingOrThinking =
        voiceSessionStatusRef.current === 'speaking' ||
        voiceSessionStatusRef.current === 'generating_response' ||
        voiceSessionStatusRef.current === 'processing_speech' ||
        isPendingRef.current ||
        Boolean(stopSpeechPlaybackRef.current);

      if (!isCurrentlySpeakingOrThinking) return;

      RetisVoiceDiagnostics.record('interrupted', {
        hasTranscript: Boolean(bargeInTranscript && bargeInTranscript.trim()),
      });

      // 1. Stop any active or queued TTS playback immediately
      stopSpeechPlayback();

      // 2. Abort any in-flight /api/retis-chat request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('interrupted');
        abortControllerRef.current = null;
      }
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }
      setIsPending(false);

      // 3. Mark the interrupted assistant message in the conversation thread
      const interruptedMsgId = activeVoiceAssistantMsgIdRef.current;
      if (interruptedMsgId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === interruptedMsgId
              ? {
                  ...m,
                  interrupted: true,
                  structured: m.structured
                    ? { ...m.structured, interrupted: true }
                    : m.structured,
                }
              : m
          )
        );
      }

      updateVoiceSessionStatus('listening');

      // 5. Freeze active caption at 35% opacity for 300ms, then crossfade to user live transcript
      if (captionWordTimerRef.current !== null) {
        window.clearInterval(captionWordTimerRef.current);
        captionWordTimerRef.current = null;
      }
      if (captionHoldTimerRef.current !== null) {
        window.clearTimeout(captionHoldTimerRef.current);
        captionHoldTimerRef.current = null;
      }
      if (captionFadeTimerRef.current !== null) {
        window.clearTimeout(captionFadeTimerRef.current);
        captionFadeTimerRef.current = null;
      }
      setIsReplyInterruptedFreeze(true);
      if (interruptFreezeTimerRef.current !== null) {
        window.clearTimeout(interruptFreezeTimerRef.current);
      }
      interruptFreezeTimerRef.current = window.setTimeout(() => {
        interruptFreezeTimerRef.current = null;
        setActiveReplyText('');
        setActiveWordIndex(0);
        setTotalReplyWords(0);
        setIsReplyHolding(false);
        setIsReplyInterruptedFreeze(false);
        setIsReplyFadingOut(false);
        setActiveReplyMetrics([]);
        setActiveReplySource(null);
        activeVoiceAssistantMsgIdRef.current = null;
      }, 300);

      if (bargeInTranscript && bargeInTranscript.trim()) {
        setInterimTranscript(bargeInTranscript);
      }
    },
    [stopSpeechPlayback, updateVoiceSessionStatus]
  );

  const handleBargeInRef = useRef(handleBargeInInterruption);
  useEffect(() => {
    handleBargeInRef.current = handleBargeInInterruption;
  }, [handleBargeInInterruption]);

  const handleSendMessage = useCallback(
    async (explicitQuery?: string, focusMetricId?: RetisMetricId, isVoiceTurn = false) => {
      const query = (explicitQuery !== undefined ? explicitQuery : inputQuery).trim();
      if (!query || isPending) return;

      // Stop any running speech playback immediately
      stopSpeechPlayback();
      resetVoiceCaptionState();

      if (explicitQuery === undefined) {
        setInputQuery('');
      }
      setInterimTranscript('');
      setIsPlusMenuOpen(false);
      setIsSnapshotPopoverOpen(false);
      setIsConvOverflowOpen(false);

      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const nowIso = new Date().toISOString();

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: query,
        timestamp: nowStr,
        createdAt: nowIso,
        isVoice: isVoiceTurn,
      };

      // Switch to conversation state and show pending indicator in the exact same render
      shouldForceScrollRef.current = true;
      setViewMode('conversation');
      setMessages((prev) => [...prev, userMessage]);
      setIsPending(true);
      setLastRequestHadError(false);

      if (voiceArmedRef.current || isVoiceTurn) {
        updateVoiceSessionStatus('generating_response');
      }

      // Fresh authoritative live snapshot evaluated at the exact millisecond of send
      const freshLiveSnapshot = buildFreshLiveSnapshotFromStore(
        telemetryRef.current,
        isMonitoringRef.current,
        cameraStatusRef.current,
        cameraErrorRef.current
      );
      const frozenAtSend = captureFrozenMetrics(freshLiveSnapshot);

      RetisTelemetryDiagnostics.record({
        type: 'request_sent',
        timestampMs: Date.now(),
        blinkRateBpm:
          typeof freshLiveSnapshot.metricEntries.blink_rate_bpm.rawValue === 'number'
            ? freshLiveSnapshot.metricEntries.blink_rate_bpm.rawValue
            : null,
        screenDistanceCm:
          typeof freshLiveSnapshot.metricEntries.screen_distance_cm.rawValue === 'number'
            ? freshLiveSnapshot.metricEntries.screen_distance_cm.rawValue
            : null,
        measurementTimestampMs: freshLiveSnapshot.llmPayload.measurementTimestampMs,
        ageSeconds: freshLiveSnapshot.llmPayload.ageSeconds,
        note: `${isVoiceTurn ? 'voice' : 'text'}:${query.slice(0, 48)}`,
      });

      if (isVoiceTurn || voiceArmedRef.current) {
        RetisVoiceDiagnostics.record('snapshot_built', {
          ageSeconds: freshLiveSnapshot.llmPayload.ageSeconds ?? -1,
          monitoringStatus: freshLiveSnapshot.llmPayload.monitoringStatusLabel,
        });
        RetisVoiceDiagnostics.record('request_sent', {
          source: 'voice',
          wordCount: query.split(/\s+/).filter(Boolean).length,
        });
      }

      // ======================================================================
      // LOCAL FAST PATH (<50ms deterministic answer for direct single-metric questions)
      // ======================================================================
      const localFastMatch = matchRetisLocalFastPathIntent(
        query,
        freshLiveSnapshot,
        frozenAtSend
      );

      if (localFastMatch) {
        const resolvedLocalText = localFastMatch.resolvedText;
        const msgId = `retis-local-${Date.now()}`;

        if (isVoiceTurn || voiceArmedRef.current) {
          RetisVoiceDiagnostics.record('reply_received', {
            source: 'local',
            length: resolvedLocalText.length,
          });
          RetisVoiceDiagnostics.record('validation_result', {
            valid: true,
            source: 'local',
          });
        }

        RetisTelemetryDiagnostics.record({
          type: 'reply_received',
          timestampMs: Date.now(),
          blinkRateBpm:
            typeof freshLiveSnapshot.metricEntries.blink_rate_bpm.rawValue === 'number'
              ? freshLiveSnapshot.metricEntries.blink_rate_bpm.rawValue
              : null,
          screenDistanceCm:
            typeof freshLiveSnapshot.metricEntries.screen_distance_cm.rawValue === 'number'
              ? freshLiveSnapshot.metricEntries.screen_distance_cm.rawValue
              : null,
          measurementTimestampMs: freshLiveSnapshot.llmPayload.measurementTimestampMs,
          ageSeconds: freshLiveSnapshot.llmPayload.ageSeconds,
          note: `local:${resolvedLocalText.slice(0, 72)}`,
        });

        const localAssistantMsg: ChatMessage = {
          id: msgId,
          role: 'assistant',
          content: resolvedLocalText,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          createdAt: new Date().toISOString(),
          isOffTopic: false,
          isFreshReply: true,
          isVoice: isVoiceTurn || voiceArmedRef.current,
          source: 'local',
          frozenMetrics: frozenAtSend,
          structured: {
            answer: localFastMatch.structured.answer,
            answerTemplate: localFastMatch.structured.answer_template,
            metricsUsed: localFastMatch.structured.metrics_used,
            dataPeriod: freshLiveSnapshot.reportingPeriodLabel,
            observedDurationLabel: freshLiveSnapshot.observedDurationFormatted,
            dataLimitations: localFastMatch.structured.data_limitations,
            outOfScope: false,
            suggestedAction: localFastMatch.structured.suggested_action,
            source: 'local',
          },
        };

        setMessages((prev) => [...prev, localAssistantMsg]);
        setIsPending(false);

        const inVoiceSession = Boolean(voiceArmedRef.current || isVoiceTurn);
        if (inVoiceSession) {
          const shouldSpeakAloud = Boolean(
            voiceArmedRef.current && !isVoiceMutedRef.current
          );
          startVoiceReplyPresentation(
            msgId,
            resolvedLocalText,
            localFastMatch.structured.metrics_used,
            frozenAtSend,
            freshLiveSnapshot.reportingPeriodLabel,
            freshLiveSnapshot.observedDurationFormatted,
            'local',
            shouldSpeakAloud
          );
        }
        return;
      }

      if (!navigator.onLine) {
        setIsBrowserOnline(false);
        setLastRequestHadError(true);
        setIsPending(false);
        if (voiceArmedRef.current) {
          updateVoiceSessionStatus('listening');
        }
        const offlineMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content:
            'Offline — network connection is unavailable. Showing your local snapshot metrics directly below.',
          timestamp: nowStr,
          createdAt: nowIso,
          isError: true,
          retryQuery: query,
          retryMetricId: focusMetricId,
          frozenMetrics: frozenAtSend,
        };
        setMessages((prev) => [...prev, offlineMsg]);
        return;
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      timeoutIdRef.current = window.setTimeout(() => {
        controller.abort('timeout');
      }, REQUEST_TIMEOUT_MS);

      try {
        const isShortVoiceTurn = Boolean(isVoiceTurn || voiceArmedRef.current);
        const maxHistoryTurns = isShortVoiceTurn
          ? RETIS_VOICE_HISTORY_TURNS
          : RETIS_MAX_HISTORY_TURNS;

        // Bounded in-session history (4 turns in Voice Mode, 10 turns in text chat).
        // Assistant turns keep {{metric:<id>}} placeholders so Gemini never repeats stale metric numbers from earlier turns.
        const boundedHistory = messages
          .filter((m) => !m.isError)
          .slice(-(maxHistoryTurns * 2))
          .map((m) => ({
            role: m.role,
            interrupted: Boolean(m.interrupted),
            content:
              m.role === 'assistant'
                ? sanitizeHistoryTurnToTokens(
                    m.structured
                      ? m.structured.answerTemplate || m.structured.answer
                      : m.content,
                    m.frozenMetrics
                  )
                : m.content,
          }));

        const msgId = `retis-${Date.now()}`;
        const shouldSpeakAloud = Boolean(
          isShortVoiceTurn && voiceArmedRef.current && !isVoiceMutedRef.current
        );

        if (isShortVoiceTurn) {
          activeVoiceAssistantMsgIdRef.current = msgId;
          setActiveReplyText('');
          setActiveWordIndex(0);
          setTotalReplyWords(0);
          setIsReplyHolding(false);
          setIsReplyInterruptedFreeze(false);
          setIsReplyFadingOut(false);
          setActiveReplyMetrics([]);
          setActiveReplyPeriodLabel(freshLiveSnapshot.reportingPeriodLabel);
          setActiveReplyObservedLabel(freshLiveSnapshot.observedDurationFormatted);
          setActiveReplySource('model');
        }

        // Add the initial assistant turn to the messages thread
        const initialAssistantMessage: ChatMessage = {
          id: msgId,
          role: 'assistant',
          content: '',
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          createdAt: new Date().toISOString(),
          isOffTopic: false,
          isFreshReply: true,
          isVoice: isShortVoiceTurn,
          source: 'model',
          frozenMetrics: frozenAtSend,
        };
        setMessages((prev) => [...prev, initialAssistantMessage]);

        let hasBegunSpokenReply = false;
        let cumulativeText = '';

        const cancelStream = streamRetisChatAndVoice(query, {
          focusMetricId,
          history: boundedHistory,
          snapshot: freshLiveSnapshot.llmPayload,
          shouldPlayAudio: shouldSpeakAloud,
          onSentenceAudioStart: (_sentIdx, sentText, _durMs) => {
            if (!hasBegunSpokenReply) {
              hasBegunSpokenReply = true;
              setIsPending(false);
              setHasSucceededRequest(true);
              setServerConfigured(true);
              setLastRequestHadError(false);
              if (shouldSpeakAloud) {
                updateVoiceSessionStatus('speaking');
              }
            }

            cumulativeText = cumulativeText ? `${cumulativeText} ${sentText}` : sentText;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId ? { ...m, content: cumulativeText } : m
              )
            );

            if (isShortVoiceTurn) {
              setActiveReplyText(sentText);
              if (recControllerRef.current) {
                recControllerRef.current.setEchoSuppressionText(sentText);
              }
            }
          },
          onOutputLevel: (lvl) => {
            setOutputVolume(lvl);
          },
          onWordBoundary: (wordIndex, totalWords) => {
            setTotalReplyWords(totalWords);
            setActiveWordIndex(wordIndex);
          },
          onDone: (structured) => {
            stopSpeechPlaybackRef.current = null;
            setOutputVolume(0);
            setIsPending(false);

            if (recControllerRef.current) {
              recControllerRef.current.setEchoSuppressionText(null);
            }

            const isOutOfScope = Boolean(structured.out_of_scope);
            const templateText =
              structured.answer || structured.answer_template || cumulativeText || RETIS_OUT_OF_SCOPE_REDIRECT_TEXT;
            const finalResolvedText = isOutOfScope
              ? templateText
              : substituteSnapshotTokens(templateText, freshLiveSnapshot, frozenAtSend);
            const metricsUsedList = isOutOfScope ? [] : structured.metrics_used || [];

            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content: finalResolvedText,
                      isOffTopic: isOutOfScope,
                      isFreshReply: false,
                      structured: {
                        answer: templateText,
                        answerTemplate: templateText,
                        metricsUsed: metricsUsedList,
                        dataPeriod: structured.data_period || freshLiveSnapshot.reportingPeriodLabel,
                        observedDurationLabel: freshLiveSnapshot.observedDurationFormatted,
                        dataLimitations: isOutOfScope ? '' : structured.data_limitations,
                        outOfScope: isOutOfScope,
                        suggestedAction: isOutOfScope ? 'none' : structured.suggested_action,
                        source: 'model',
                      },
                    }
                  : m
              )
            );

            if (isShortVoiceTurn) {
              const wordCount = finalResolvedText.split(/\s+/).filter(Boolean).length;
              scheduleVoiceCaptionHoldAndFade(wordCount);
              if (voiceArmedRef.current && !isVoiceMutedRef.current) {
                recControllerRef.current?.resumeAfterSpeechOutput();
                updateVoiceSessionStatus('listening');
              }
            }
          },
          onError: (errMsg) => {
            stopSpeechPlaybackRef.current = null;
            setOutputVolume(0);
            setIsPending(false);
            setLastRequestHadError(true);
            if (voiceArmedRef.current) {
              updateVoiceSessionStatus('listening');
            }
            showVoiceNotice(errMsg, 4000);
          },
        });

        stopSpeechPlaybackRef.current = cancelStream;
      } catch (err: unknown) {
        if (timeoutIdRef.current !== null) {
          window.clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }

        const abortReason = controller.signal.reason;
        if (
          controller.signal.aborted &&
          (abortReason === 'user_cancelled' || abortReason === 'interrupted')
        ) {
          if (voiceArmedRef.current && !isVoiceMutedRef.current) {
            updateVoiceSessionStatus('listening');
          }
          return;
        }

        setLastRequestHadError(true);
        const isTimeout =
          (controller.signal.aborted && abortReason === 'timeout') ||
          (err instanceof Error && err.name === 'AbortError');

        const honestReason = isTimeout
          ? 'Request timed out after 30 seconds.'
          : err instanceof Error
          ? err.message
          : 'Unable to reach the RETIS reporting service.';

        const errorAssistantMsg: ChatMessage = {
          id: `retis-err-${Date.now()}`,
          role: 'assistant',
          content: honestReason,
          timestamp: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }),
          createdAt: new Date().toISOString(),
          isError: true,
          retryQuery: query,
          retryMetricId: focusMetricId,
          frozenMetrics: frozenAtSend,
        };

        setMessages((prev) => [...prev, errorAssistantMsg]);
        if (voiceArmedRef.current && !isVoiceMutedRef.current) {
          if (recControllerRef.current) {
            recControllerRef.current.resumeAfterSpeechOutput();
          }
          updateVoiceSessionStatus('listening');
        }
      } finally {
        abortControllerRef.current = null;
        setIsPending(false);
      }
    },
    [
      captureFrozenMetrics,
      inputQuery,
      isPending,
      messages,
      resetVoiceCaptionState,
      startVoiceReplyPresentation,
      stopSpeechPlayback,
      updateVoiceSessionStatus,
    ]
  );

  // Dequeue and send the next queued spoken message as soon as the current request finishes.
  // Each dequeued message calls handleSendMessage at the moment of send, building a fresh live telemetry snapshot.
  useEffect(() => {
    if (!isPending && queuedVoiceMessages.length > 0) {
      const [nextMessage, ...rest] = queuedVoiceMessages;
      setQueuedVoiceMessages(rest);
      handleSendMessage(nextMessage, undefined, true);
    }
  }, [isPending, queuedVoiceMessages, handleSendMessage]);

  // Keep a ref to the latest utterance commit handler so the armed recognition session always invokes the newest callback
  const handleVoiceUtteranceCommit = useCallback(
    (committedText: string) => {
      setInterimTranscript('');
      const clean = committedText.trim();
      if (!clean) return;

      // Clear composer text if it was holding the interim transcript
      setInputQuery('');

      if (voiceArmedRef.current) {
        updateVoiceSessionStatus('processing_speech');
      }

      // If a request is currently in flight, queue up to MAX_QUEUED_VOICE_MESSAGES (3)
      if (isPendingRef.current) {
        setQueuedVoiceMessages((prev) => {
          if (prev.length >= MAX_QUEUED_VOICE_MESSAGES) {
            return prev;
          }
          return [...prev, clean];
        });
        return;
      }

      handleSendMessage(clean, undefined, true);
    },
    [handleSendMessage, updateVoiceSessionStatus]
  );

  const handleVoiceUtteranceCommitRef = useRef(handleVoiceUtteranceCommit);
  useEffect(() => {
    handleVoiceUtteranceCommitRef.current = handleVoiceUtteranceCommit;
  }, [handleVoiceUtteranceCommit]);

  // Start persistent inline voice mode synchronously inside the click gesture
  const armVoiceInput = useCallback(async () => {
    stopSpeechPlayback();
    unlockRetisPlaybackAudioContext();
    clearAcousticWatchdogTimers();
    showVoiceNotice(null);
    setVoiceDiagnosticHint(null);
    setInterimTranscript('');
    setIsReconnectingMic(false);
    isVoiceMutedRef.current = false;
    setIsVoiceMuted(false);
    hasReceivedTranscriptThisWindowRef.current = false;

    RetisVoiceDiagnostics.startNewSession();
    RetisVoiceDiagnostics.record('voice_open');

    // Warm up the server connection on Voice Mode entry without sending user data
    fetch('/api/retis-warmup', { method: 'POST' }).catch(() => {});

    const controller = SpeechRecognitionController.getInstance();
    recControllerRef.current = controller;

    if (!controller.isSupported() && !RetisLiveVoiceClient.isSupported()) {
      const msg =
        'Voice recognition is not supported in this browser. Please use Chrome or Edge.';
      setVoiceBlockedReason(msg);
      updateVoiceSessionStatus('error');
      showVoiceNotice(msg);
      return;
    }

    const attemptId = ++armAttemptIdRef.current;
    setVoiceBlockedReason(null);
    voiceArmedRef.current = true;
    setVoiceArmed(true);
    // Truthfully show "Starting..." until rec.onstart fires
    updateVoiceSessionStatus('requesting_permission');
    setVoiceAnnouncement('Starting voice mode');

    // Start SpeechRecognitionController synchronously inside the user click handler before any await
    if (controller.isSupported()) {
      const armed = controller.arm({
        enableStartTimeoutWatchdog: true,
        startTimeoutMs: START_TIMEOUT_MS,
        onRecognitionStarted: () => {
          if (attemptId !== armAttemptIdRef.current || !voiceArmedRef.current) return;
          setIsReconnectingMic(false);
          setVoiceBlockedReason(null);
          setVoiceDiagnosticHint(null);
          hasReceivedTranscriptThisWindowRef.current = false;
          soundWithoutTranscriptSinceMsRef.current = null;
          if (!isPendingRef.current && !isVoiceMutedRef.current) {
            updateVoiceSessionStatus(
              stopSpeechPlaybackRef.current ? 'speaking' : 'listening'
            );
            setVoiceAnnouncement('Voice mode listening');
            armNoSoundWatchdogTimer();
          }
        },
        onStartTimeout: (reason: string) => {
          if (attemptId !== armAttemptIdRef.current || !voiceArmedRef.current) return;
          voiceArmedRef.current = false;
          setVoiceArmed(false);
          clearAcousticWatchdogTimers();
          if (recControllerRef.current) {
            recControllerRef.current.disarm();
          }
          if (micMeterRef.current) {
            micMeterRef.current.stop();
            micMeterRef.current = null;
          }
          setVoiceBlockedReason(reason);
          updateVoiceSessionStatus('error');
          setVoiceAnnouncement('Microphone unavailable');
          showVoiceNotice(reason);
        },
        onGuardStateChange: (guardState) => {
          if (!voiceArmedRef.current) return;
          if (guardState === 'starting') {
            setIsReconnectingMic(false);
          } else if (guardState === 'running') {
            setIsReconnectingMic(false);
            if (!isPendingRef.current && !isVoiceMutedRef.current) {
              updateVoiceSessionStatus(
                stopSpeechPlaybackRef.current ? 'speaking' : 'listening'
              );
            }
          }
        },
        onTranscriptChange: (text: string) => {
          // If user starts speaking while a previous caption is holding/fading, clear the old caption immediately
          if (text.trim().length > 0) {
            hasReceivedTranscriptThisWindowRef.current = true;
            soundWithoutTranscriptSinceMsRef.current = null;
            setVoiceDiagnosticHint(null);
            armNoSoundWatchdogTimer();
            if (!stopSpeechPlaybackRef.current && !isPendingRef.current) {
              resetVoiceCaptionState();
            }
          }
          setInterimTranscript(text);
          if (
            voiceArmedRef.current &&
            !isPendingRef.current &&
            !stopSpeechPlaybackRef.current &&
            !isVoiceMutedRef.current
          ) {
            updateVoiceSessionStatus('listening');
          }
        },
        onBargeIn: (bargeInText: string) => {
          handleBargeInRef.current(bargeInText);
        },
        onUtteranceComplete: (text: string) => {
          setVoiceDiagnosticHint(null);
          soundWithoutTranscriptSinceMsRef.current = null;
          handleVoiceUtteranceCommitRef.current(text);
        },
        onUnintelligible: () => {
          if (voiceArmedRef.current && !isPendingRef.current && !isVoiceMutedRef.current) {
            updateVoiceSessionStatus('listening');
          }
        },
        onFatalDisarm: (reason: string, isBlocked?: boolean) => {
          voiceArmedRef.current = false;
          setVoiceArmed(false);
          clearAcousticWatchdogTimers();
          setInterimTranscript('');
          setMicVolume(0);
          updateVoiceSessionStatus('error');
          if (micMeterRef.current) {
            micMeterRef.current.stop();
            micMeterRef.current = null;
          }
          if (isBlocked && reason) {
            setVoiceBlockedReason(reason);
          } else if (reason) {
            setIsReconnectingMic(true);
            setVoiceBlockedReason(reason);
          }
          setVoiceAnnouncement('Microphone unavailable');
          if (reason) {
            showVoiceNotice(reason);
          }
        },
        onInactivityTimeout: (reason: string) => {
          disarmVoiceInput(reason);
        },
      });

      if (!armed) {
        const msg = "Couldn't start the microphone. Tap the microphone to try again.";
        setVoiceBlockedReason(msg);
        updateVoiceSessionStatus('error');
        showVoiceNotice(msg);
        return;
      }
    }

    // Start real microphone analyser (with echoCancellation + noiseSuppression + autoGainControl)
    // and 200ms sustained voice activity barge-in detector in parallel
    const meter = new MicVolumeMeter();
    micMeterRef.current = meter;
    const meterResult = await meter.start(
      (vol) => {
        if (attemptId !== armAttemptIdRef.current) return;
        const effectiveVol = isVoiceMutedRef.current ? 0 : vol;
        setMicVolume(effectiveVol);

        // Compare real acoustic signal against recognition output while in 'listening' state
        if (
          voiceArmedRef.current &&
          !isVoiceMutedRef.current &&
          !isPendingRef.current &&
          !stopSpeechPlaybackRef.current &&
          voiceSessionStatusRef.current === 'listening'
        ) {
          const smoothed0to1 = meter.getSmoothedLevel();
          const activeFloor = Math.max(0.055, meter.getNoiseFloor() * 1.9);
          if (smoothed0to1 >= activeFloor) {
            // Real sound above noise floor -> reset 5s no-sound timer
            armNoSoundWatchdogTimer();
            setVoiceDiagnosticHint((prev) =>
              prev === "I can't hear anything. Check your microphone." ? null : prev
            );

            // Track continuous sound without any recognition result for 8s
            if (!hasReceivedTranscriptThisWindowRef.current) {
              const nowMs = Date.now();
              if (soundWithoutTranscriptSinceMsRef.current === null) {
                soundWithoutTranscriptSinceMsRef.current = nowMs;
              } else if (
                nowMs - soundWithoutTranscriptSinceMsRef.current >= NO_TRANSCRIPT_HINT_MS
              ) {
                const noTranscriptMsg =
                  "I can hear sound but can't transcribe it. Voice input may not be supported here.";
                RetisVoiceDiagnostics.record('no_transcript_hint', {
                  afterMs: NO_TRANSCRIPT_HINT_MS,
                });
                setVoiceDiagnosticHint(noTranscriptMsg);
              }
            }
          }
        }
      },
      {
        onSustainedVoiceActivity: () => {
          if (attemptId !== armAttemptIdRef.current || isVoiceMutedRef.current) return;
          handleBargeInRef.current();
        },
      }
    );

    if (attemptId !== armAttemptIdRef.current) {
      meter.stop();
      if (micMeterRef.current === meter) {
        micMeterRef.current = null;
      }
      return;
    }

    if (!meterResult.started) {
      micMeterRef.current = null;
      const reason =
        meterResult.errorReason || 'Microphone access is blocked in browser settings';
      if (meterResult.isBlocked) {
        setVoiceBlockedReason(reason);
        if (recControllerRef.current) {
          recControllerRef.current.disarm();
        }
        voiceArmedRef.current = false;
        setVoiceArmed(false);
        clearAcousticWatchdogTimers();
        updateVoiceSessionStatus('error');
        showVoiceNotice(reason);
      }
    }
  }, [
    armNoSoundWatchdogTimer,
    clearAcousticWatchdogTimers,
    disarmVoiceInput,
    resetVoiceCaptionState,
    showVoiceNotice,
    stopSpeechPlayback,
    updateVoiceSessionStatus,
  ]);

  // Toggle microphone mute/unmute inside Voice Mode
  const toggleVoiceMute = useCallback(() => {
    if (!voiceArmedRef.current) return;
    if (voiceBlockedReason) {
      void armVoiceInput();
      return;
    }
    const nextMuted = !isVoiceMutedRef.current;
    isVoiceMutedRef.current = nextMuted;
    setIsVoiceMuted(nextMuted);

    if (recControllerRef.current) {
      recControllerRef.current.setMuted(nextMuted);
    }
    if (nextMuted) {
      setMicVolume(0);
      setInterimTranscript('');
      setVoiceAnnouncement('Microphone muted');
    } else {
      setVoiceAnnouncement('Microphone unmuted');
      if (!isPendingRef.current && !stopSpeechPlaybackRef.current) {
        updateVoiceSessionStatus('listening');
      }
    }
  }, [armVoiceInput, updateVoiceSessionStatus, voiceBlockedReason]);

  // Toggle persistent voice mode on button press
  const toggleVoiceListening = useCallback(() => {
    if (
      voiceArmedRef.current ||
      voiceSessionStatusRef.current === 'requesting_permission'
    ) {
      disarmVoiceInput();
    } else {
      void armVoiceInput();
    }
  }, [armVoiceInput, disarmVoiceInput]);

  // Global keyboard shortcuts inside Voice Mode:
  // - Escape: discard queued messages or exit Voice Mode
  useEffect(() => {
    const handleGlobalVoiceKeys = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (e.key === 'Escape') {
        if (queuedVoiceMessages.length > 0) {
          e.preventDefault();
          setQueuedVoiceMessages([]);
          showVoiceNotice('Cleared queued voice messages', 2000);
          return;
        }
        if (voiceArmedRef.current) {
          e.preventDefault();
          disarmVoiceInput();
        }
        return;
      }
    };
    window.addEventListener('keydown', handleGlobalVoiceKeys);
    return () => {
      window.removeEventListener('keydown', handleGlobalVoiceKeys);
    };
  }, [disarmVoiceInput, queuedVoiceMessages.length, showVoiceNotice]);

  // Trigger native PDF generation and browser/Electron download
  const handleDownloadMonthlyPdf = useCallback(
    (openPreviewAfter = false) => {
      if (!snapshot.hasAnyObservations) return;
      setIsGeneratingPdf(true);
      setPdfError(null);
      try {
        const pdfBytes = generateRetisMonthlyPdfBytes(snapshot, pdfAiNarrative);
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const safeStart = snapshot.dateRangeStart.replace(/[^a-zA-Z0-9]+/g, '-');
        const safeEnd = snapshot.dateRangeEnd.replace(/[^a-zA-Z0-9]+/g, '-');
        const filename = `IRIS-Monthly-Report-${safeStart}-to-${safeEnd}.pdf`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);

        setLastDownloadedFilename(filename);
        if (openPreviewAfter) {
          setActiveModal('report');
        }
      } catch (err: unknown) {
        setPdfError(
          err instanceof Error ? err.message : 'Failed to generate monthly PDF report.'
        );
      } finally {
        setIsGeneratingPdf(false);
      }
    },
    [snapshot, pdfAiNarrative]
  );

  // Optional schema-validated Gemini narrative for the Monthly Report modal
  const handleRequestPdfAiNarrative = async () => {
    if (isGeneratingNarrative || !snapshot.hasAnyObservations) return;
    setIsGeneratingNarrative(true);
    setPdfError(null);
    try {
      const res = await fetch('/api/retis-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question:
            'Summarize my screen habits for the monthly report using my blink rate, screen distance, alerts, and longest session.',
          focusMetricId: 'blink_rate_bpm',
          history: [],
          snapshot: snapshot.llmPayload,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const validation = validateRetisStructuredResponse(data?.structured, snapshot);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      setHasSucceededRequest(true);
      setPdfAiNarrative(
        substituteSnapshotTokens(
          validation.data.answer || validation.data.answer_template,
          snapshot
        )
      );
    } catch (err: unknown) {
      setPdfError(
        err instanceof Error
          ? `AI narrative unavailable (${err.message}). Local verified report remains ready.`
          : 'AI narrative unavailable.'
      );
    } finally {
      setIsGeneratingNarrative(false);
    }
  };

  // Execute suggested action from a RETIS response
  const handleExecuteSuggestedAction = (action: RetisSuggestedAction) => {
    if (action === 'start_break') {
      // Requirement: "A 'Start Break' action only navigates to OCURE. It must never mark an exercise as completed."
      onSelectTab('ocure');
    } else if (action === 'view_heatmap') {
      setActiveModal('heatmap');
    } else if (action === 'view_trends') {
      setActiveModal('trends');
    } else if (action === 'download_report') {
      setActiveModal('report');
    }
  };

  const suggestedActionLabels: Record<Exclude<RetisSuggestedAction, 'none'>, string> = {
    start_break: 'Start Break in OCURE',
    view_heatmap: 'Open Heat Map',
    view_trends: 'Open Trends',
    download_report: 'Monthly Report (PDF)',
  };

  // Text-safe accent token (guaranteed >= 4.5:1 contrast against card/chip surface)
  const safeAccentTextHex = accentTextColor || 'var(--theme-accent-text)';
  const rawAccentHex = isMinimal
    ? accentColor || (isDark ? '#FF7A1A' : '#7B5CD6')
    : accentColor || (isDark ? '#D4FF3F' : '#FF851B');

  const chartAxisColor = isMinimal
    ? isDark
      ? '#B8AAA0'
      : '#475569'
    : isDark
    ? '#F5F5F0'
    : '#000000';

  const chartGridColor = isMinimal
    ? isDark
      ? 'rgba(255, 245, 235, 0.10)'
      : 'rgba(15, 23, 42, 0.08)'
    : isDark
    ? 'rgba(245, 245, 240, 0.16)'
    : 'rgba(0, 0, 0, 0.15)';

  // 7 Snapshot metrics for the anchored Snapshot Popover (with all secondary details visible)
  const snapshotMetricsList: Array<{
    id: RetisMetricId;
    title: string;
    icon: React.ReactNode;
    question: string;
    valueNode: React.ReactNode;
    statusPill: string;
    subline1: string;
    subline2: string;
  }> = [
    {
      id: 'blink_rate_bpm',
      title: 'Avg. blink rate',
      icon: <Eye className="w-3.5 h-3.5" />,
      question:
        'What is my current average blink rate, and how does it compare to the 14–18 BPM target range?',
      valueNode: (
        <span className="inline-flex items-baseline gap-0.5 tabular-nums font-bold">
          <AnimatedNumber value={snapshot.displayBlinkRate} fallback="--" />
          {snapshot.displayBlinkRate !== null && <span className="text-[11px]">BPM</span>}
        </span>
      ),
      statusPill: snapshot.blinkRateStatusLabel,
      subline1:
        snapshot.hasSessionObservations || isMonitoring
          ? `${telemetry.totalBlinksDetected} blinks · ${snapshot.blinkTargetRangeLabel}`
          : `No data yet · ${snapshot.blinkTargetRangeLabel}`,
      subline2: `Observed: ${snapshot.observedDurationWithCoverage} · 7-day avg: ${
        snapshot.pastWeekData.length > 0 ? `${snapshot.avgBlinkRateWeekly} BPM` : 'No data yet'
      }`,
    },
    {
      id: 'screen_distance_cm',
      title: 'Screen distance',
      icon: <Ruler className="w-3.5 h-3.5" />,
      question:
        'What is my average screen distance right now, and is my viewing distance calibrated and within the 38–65 cm optimal zone?',
      valueNode: (
        <span className="inline-flex items-baseline gap-0.5 tabular-nums font-bold">
          <AnimatedNumber value={snapshot.displayDistance} fallback="--" />
          {snapshot.displayDistance !== null && <span className="text-[11px]">cm</span>}
        </span>
      ),
      statusPill: snapshot.distanceStatus,
      subline1: !telemetry.isCalibrated
        ? 'Uncalibrated — calibrate distance to measure cm'
        : snapshot.displayDistance !== null
        ? `Zone: ${snapshot.distanceZone} (Optimal 38–65 cm)`
        : 'No face detected in camera view',
      subline2: `Calibration: ${snapshot.distanceStatus} · 7-day avg: ${
        snapshot.pastWeekData.length > 0 && snapshot.avgDistanceWeekly > 0
          ? `${snapshot.avgDistanceWeekly} cm`
          : 'No data yet'
      }`,
    },
    {
      id: 'blink_alerts_count',
      title: 'Blink alerts',
      icon: <Bell className="w-3.5 h-3.5" />,
      question: 'How many blink alerts (<10 BPM) have been delivered today, and what triggered them?',
      valueNode: (
        <span className="tabular-nums font-bold">
          {snapshot.hasAnyObservations || isMonitoring ? telemetry.blinkAlerts : '--'}
        </span>
      ),
      statusPill: snapshot.hasAnyObservations || isMonitoring ? '<10 BPM' : 'No data yet',
      subline1:
        snapshot.hasAnyObservations || isMonitoring
          ? `Blink alerts (<10 BPM rule): ${telemetry.blinkAlerts} delivered today`
          : 'No observations recorded today',
      subline2: `Observed: ${snapshot.observedDurationFormatted} · Separate from distance warnings`,
    },
    {
      id: 'distance_warnings_count',
      title: 'Distance warnings',
      icon: <Bell className="w-3.5 h-3.5" />,
      question: 'How many close-proximity screen distance warnings have been delivered today?',
      valueNode: (
        <span className="tabular-nums font-bold">
          {!telemetry.isCalibrated
            ? '--'
            : snapshot.hasAnyObservations || isMonitoring
            ? telemetry.distanceAlerts
            : '--'}
        </span>
      ),
      statusPill: !telemetry.isCalibrated
        ? 'Uncalibrated'
        : snapshot.hasAnyObservations || isMonitoring
        ? 'Proximity'
        : 'No data yet',
      subline1: !telemetry.isCalibrated
        ? 'Uncalibrated — requires screen distance calibration'
        : snapshot.hasAnyObservations || isMonitoring
        ? `Distance warnings: ${telemetry.distanceAlerts} delivered today`
        : 'No observations recorded today',
      subline2: `Completed breaks today: ${snapshot.completedBreaksToday} (tracked separately)`,
    },
    {
      id: 'longest_session_hours',
      title: 'Longest session',
      icon: <Clock className="w-3.5 h-3.5" />,
      question:
        'How long is my longest continuous screen session today, and when should I take my next break?',
      valueNode: (
        <span className="inline-flex items-baseline gap-0.5 tabular-nums font-bold">
          <span>
            {snapshot.hasAnyObservations || isMonitoring ? telemetry.longestSessionHours : '--'}
          </span>
          {(snapshot.hasAnyObservations || isMonitoring) && (
            <span className="text-[11px]">hrs</span>
          )}
        </span>
      ),
      statusPill:
        snapshot.hasAnyObservations || isMonitoring
          ? `Obs ${snapshot.observedDurationFormatted}`
          : 'No data yet',
      subline1:
        snapshot.hasAnyObservations || isMonitoring
          ? `Active screen time today: ${telemetry.screenTimeHours} hrs`
          : 'No tracked session recorded yet',
      subline2: `Break routines: 2 minutes (${snapshot.completedBreaksToday} completed today)`,
    },
    {
      id: 'total_validated_blinks',
      title: 'Validated blinks',
      icon: <Activity className="w-3.5 h-3.5" />,
      question:
        'How many total validated blinks have been recorded during my observed time today?',
      valueNode: (
        <span className="tabular-nums font-bold">
          {snapshot.hasSessionObservations || isMonitoring ? (
            <AnimatedNumber value={telemetry.totalBlinksDetected} />
          ) : (
            '--'
          )}
        </span>
      ),
      statusPill:
        snapshot.hasSessionObservations || isMonitoring ? snapshot.blinkStatus : 'No data yet',
      subline1:
        snapshot.hasSessionObservations || isMonitoring
          ? `${telemetry.totalBlinksDetected} blinks recorded today`
          : 'No blinks recorded yet',
      subline2: `Observed: ${snapshot.observedDurationFormatted} (${
        telemetry.trackingCoveragePct ?? 100
      }% tracked)`,
    },
    {
      id: 'fatigue_score',
      title: 'Fatigue score',
      icon: <Gauge className="w-3.5 h-3.5" />,
      question:
        'What is my current fatigue score, and how is it calculated from my blink rate, screen distance, and session duration?',
      valueNode: (
        <span className="inline-flex items-baseline gap-0.5 tabular-nums font-bold">
          <AnimatedNumber value={telemetry.fatigueScore} fallback="--" />
          {telemetry.fatigueScore !== null && <span className="text-[11px]">/10</span>}
        </span>
      ),
      statusPill: snapshot.fatigueBandLabel,
      subline1:
        telemetry.fatigueScore !== null
          ? 'Comfort band ≤ 2.5 · High load ≥ 4.0'
          : telemetry.observationSeconds > 0 && telemetry.observationSeconds < 5
          ? 'Not enough data (<5s valid observation)'
          : 'No data yet — requires active observation',
      subline2: `7-day average: ${
        snapshot.pastWeekData.length > 0 ? `${snapshot.avgFatigue} / 10` : 'No data yet'
      }`,
    },
  ];

  const groupedHistory = useMemo(
    () => RetisChatHistoryStorage.groupSessionsByDate(savedSessions, historySearchQuery),
    [savedSessions, historySearchQuery]
  );

  const activeChatTitle = useMemo(() => {
    if (activeSessionId) {
      const found = savedSessions.find((s) => s.id === activeSessionId);
      if (found) return found.title;
    }
    const firstUser = messages.find((m) => m.role === 'user');
    return firstUser ? deriveChatTitleFromMessage(firstUser.content) : 'New chat';
  }, [activeSessionId, savedSessions, messages]);

  // Render inline notepad SVG indicator inside the thread (fluid mascot avatar + compact pill)
  const renderNotepadWritingIndicator = () => (
    <div
      role="status"
      aria-live="polite"
      className="retis-pending-pill-enter flex items-start gap-3 w-full"
    >
      <div
        className={`retis-thread-avatar rounded-2xl p-1 flex items-center justify-center shrink-0 ${
          isMinimal
            ? isDark
              ? 'bg-white/[0.08] border border-white/[0.16]'
              : 'bg-white/90 border border-slate-200/80 shadow-2xs'
            : isDark
            ? 'bg-[#F7F5EE] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
            : 'bg-[#FFF8ED] border-2 border-black shadow-[2px_2px_0px_#000000]'
        }`}
      >
        <img
          src={RETIS_MASCOT_SRC}
          alt="RETIS"
          draggable={false}
          className="w-full h-full object-contain select-none"
        />
      </div>

      <div
        className={
          isMinimal
            ? isDark
              ? 'rounded-3xl px-4 py-3 bg-white/[0.08] border border-white/[0.14] text-[#F5EDE4] flex items-center gap-3'
              : 'rounded-3xl px-4 py-3 bg-white/92 border border-white/95 shadow-xs text-[#0F172A] flex items-center gap-3'
            : isDark
            ? 'rounded-3xl px-4 py-3 bg-[#242424] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#F5F5F0] flex items-center gap-3'
            : 'rounded-3xl px-4 py-3 bg-[#FFF8ED] border-2 border-black shadow-[3px_3px_0px_#000000] text-black flex items-center gap-3'
        }
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
          style={{ color: safeAccentTextHex }}
        >
          <rect x="4" y="3" width="13" height="18" rx="2" />
          <line x1="7.5" y1="2" x2="7.5" y2="4.5" />
          <line x1="13.5" y1="2" x2="13.5" y2="4.5" />
          <line x1="7" y1="8.5" x2="14" y2="8.5" className="retis-notepad-line-1" />
          <line x1="7" y1="12.5" x2="13.5" y2="12.5" className="retis-notepad-line-2" />
          <line x1="7" y1="16.5" x2="12" y2="16.5" className="retis-notepad-line-3" />
          <g className="retis-notepad-pen">
            <path d="M15.5 14.5l4-4 2 2-4 4-2.5.5.5-2.5z" />
          </g>
        </svg>

        <span className="font-dm text-xs sm:text-sm font-semibold">RETIS is writing…</span>
      </div>
    </div>
  );

  // Render Composer Card (shared between Home State and Conversation State)
  const renderComposerCard = (isHomeState: boolean) => {
    const pdfDesc = snapshot.hasAnyObservations
      ? `Download monthly report (PDF) for ${snapshot.dateRangeStart} – ${snapshot.dateRangeEnd} (30-day retention)`
      : 'Disabled: No data yet — start monitoring first';
    const heatmapDesc = snapshot.hasAnyObservations
      ? 'Heat Map: hourly low-blink windows and distance warnings'
      : 'Disabled: No data yet — start monitoring first';
    const trendsDesc = !snapshot.hasAnyObservations
      ? 'Disabled: No data yet — start monitoring first'
      : snapshot.trackedDaysCount < 2
      ? `Trends (${snapshot.trackedDaysCount} of 2 required days tracked)`
      : `Trends (${snapshot.trackedDaysCount} tracked days)`;

    const displayedComposerText =
      voiceArmed && interimTranscript
        ? inputQuery
          ? `${inputQuery} ${interimTranscript}`
          : interimTranscript
        : inputQuery;
    const hasText = Boolean(displayedComposerText.trim());
    const isVoiceUnavailable = Boolean(voiceBlockedReason);
    const isVoiceActiveOrRequesting =
      voiceArmed || voiceSessionStatus === 'requesting_permission';

    const voiceStatusLabel =
      voiceSessionStatus === 'requesting_permission'
        ? 'Requesting microphone permission…'
        : voiceSessionStatus === 'processing_speech'
        ? 'Processing speech…'
        : voiceSessionStatus === 'generating_response' || isPending
        ? 'Generating response…'
        : voiceSessionStatus === 'speaking'
        ? 'Speaking…'
        : voiceSessionStatus === 'listening'
        ? 'Listening…'
        : 'Starting microphone…';

    const voiceStatusDotClass =
      voiceSessionStatus === 'requesting_permission'
        ? 'bg-amber-500'
        : voiceSessionStatus === 'speaking'
        ? 'bg-violet-500'
        : voiceSessionStatus === 'processing_speech' ||
          voiceSessionStatus === 'generating_response' ||
          isPending
        ? 'bg-sky-500'
        : 'bg-emerald-500';

    return (
      <div className="w-full flex flex-col">
        {/* Polite screen-reader live region announcing voice mode state transitions */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {voiceAnnouncement}
        </div>

        {voiceNotice && (
          <div
            role="status"
            data-voice-status={voiceSessionStatus}
            className="mb-2 px-3.5 py-2 rounded-2xl tactile-inner flex items-center justify-between gap-2 text-xs font-dm"
          >
            <span className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{voiceNotice}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                showVoiceNotice(null);
                if (!voiceArmedRef.current && voiceSessionStatusRef.current === 'error') {
                  updateVoiceSessionStatus('idle');
                }
              }}
              aria-label="Dismiss voice notice"
              className="p-0.5 rounded-full hover:opacity-80 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!isPending && hasText) {
              const textToSend = displayedComposerText.trim();
              setInputQuery('');
              setInterimTranscript('');
              handleSendMessage(textToSend);
            }
          }}
          className={`retis-composer-card w-full flex flex-col justify-between ${
            isHomeState
              ? 'retis-composer-home px-5 py-[18px]'
              : 'retis-composer-conv px-4 py-3.5'
          } ${
            isMinimal
              ? isDark
                ? 'bg-white/[0.08] backdrop-blur-md border border-white/[0.15] shadow-lg'
                : 'bg-white/90 backdrop-blur-md border border-white/95 shadow-md'
              : isDark
              ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[4px_4px_0px_#F5F5F0]'
              : 'bg-white border-2 border-black shadow-[4px_4px_0px_#000000]'
          }`}
        >
          <div className="w-full flex-1 flex flex-col">
            {isVoiceActiveOrRequesting && (
              <div
                data-voice-status={voiceSessionStatus}
                className="flex flex-wrap items-center justify-between gap-2 mb-1.5 text-[11px] font-dm"
              >
                <div className="inline-flex items-center gap-1.5 font-semibold">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${voiceStatusDotClass}`}
                    aria-hidden="true"
                  />
                  <span>{voiceStatusLabel}</span>
                  <span className="opacity-65 hidden sm:inline">
                    {voiceSessionStatus === 'speaking'
                      ? '· Mako voice'
                      : voiceSessionStatus === 'requesting_permission'
                      ? '· Allow microphone access in browser'
                      : '· Voice mode active'}
                  </span>
                </div>
                <div className="inline-flex items-center gap-2">
                  {voiceSessionStatus === 'speaking' && (
                    <button
                      type="button"
                      onClick={stopSpeechPlayback}
                      className="px-2 py-0.5 rounded-full bg-current/10 font-semibold hover:opacity-80 cursor-pointer"
                      title="Stop speaking and resume listening"
                    >
                      Stop speech
                    </button>
                  )}
                  {queuedVoiceMessages.length > 0 && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-current/10 font-semibold tabular-nums">
                      <span>{queuedVoiceMessages.length} queued</span>
                      <button
                        type="button"
                        onClick={() => setQueuedVoiceMessages([])}
                        className="underline hover:opacity-80 cursor-pointer"
                        title="Discard queued spoken messages (Esc)"
                      >
                        Esc to clear
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <label htmlFor="retis-chat-input" className="sr-only">
              Ask RETIS about your blink rate, screen distance, alerts, or breaks
            </label>
            <textarea
              id="retis-chat-input"
              ref={textareaRef}
              rows={isHomeState ? 2 : 1}
              value={displayedComposerText}
              onChange={(e) => {
                setInterimTranscript('');
                setInputQuery(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (queuedVoiceMessages.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    setQueuedVoiceMessages([]);
                    showVoiceNotice('Cleared queued voice messages', 2000);
                    return;
                  }
                  if (isVoiceActiveOrRequesting) {
                    e.preventDefault();
                    e.stopPropagation();
                    disarmVoiceInput();
                    return;
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const textToSend = displayedComposerText.trim();
                  if (!isPending && textToSend) {
                    setInputQuery('');
                    setInterimTranscript('');
                    handleSendMessage(textToSend, undefined, voiceArmed);
                  }
                }
              }}
              placeholder={
                voiceSessionStatus === 'requesting_permission'
                  ? 'Requesting microphone permission…'
                  : voiceArmed
                  ? voiceSessionStatus === 'speaking'
                    ? 'Speaking response…'
                    : isPending
                    ? 'Generating response… Keep speaking to queue your next question'
                    : 'Listening… Speak now or type a question'
                  : 'Ask RETIS about your blink rate, screen distance, alerts, or breaks...'
              }
              style={{
                maxHeight: '144px',
                minHeight: isHomeState ? '52px' : '42px',
                fontSize: 'var(--retis-body-font)',
                lineHeight: 'var(--retis-body-lh)',
              }}
              className={`w-full bg-transparent border-0 resize-none overflow-y-auto font-dm focus:outline-none ${
                isMinimal
                  ? isDark
                    ? 'text-[#F5EDE4] placeholder:text-[#94867B]'
                    : 'text-[#0F172A] placeholder:text-[#64748B]'
                  : isDark
                  ? 'text-[#F5F5F0] placeholder:text-[#A3A39E] font-medium'
                  : 'text-black placeholder:text-black/55 font-medium'
              }`}
            />
          </div>

          {/* Bottom Row inside the Composer Card: Left 36px + menu button, Right 40px Voice Mode & 40px Send/Stop */}
          <div className="flex items-center justify-between gap-2 pt-2.5 mt-1">
            {/* Left: Single 36px circular + button with compact menu */}
            <div ref={plusMenuRef} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen((prev) => !prev)}
                aria-label="More actions and suggestions"
                aria-expanded={isPlusMenuOpen}
                aria-haspopup="menu"
                title="Open reports, charts, and extra suggestions"
                className={`retis-circle-btn w-9 h-9 rounded-full inline-flex items-center justify-center cursor-pointer focus-visible:outline-2 ${
                  isMinimal
                    ? isDark
                      ? 'bg-white/[0.09] hover:bg-white/[0.16] text-[#F5EDE4] border border-white/[0.16]'
                      : 'bg-slate-100 hover:bg-slate-200/80 text-[#0F172A] border border-slate-300/80'
                    : isDark
                    ? 'bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] hover:text-[#0D0D0D] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                    : 'bg-[#FFF8ED] hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                }`}
              >
                <Plus className={`w-4 h-4 transition-transform ${isPlusMenuOpen ? 'rotate-45' : ''}`} />
              </button>

              {isPlusMenuOpen && (
                <div
                  role="menu"
                  aria-label="Actions and suggestions"
                  className={`animate-dropdown-enter absolute left-0 ${
                    isHomeState ? 'bottom-11' : 'bottom-11'
                  } w-64 rounded-2xl p-2 z-40 flex flex-col gap-1 text-xs font-dm ${
                    isMinimal
                      ? isDark
                        ? 'bg-[#1C140F] border border-white/15 text-[#F5EDE4] shadow-2xl'
                        : 'bg-white border border-slate-200/90 text-[#0F172A] shadow-xl'
                      : isDark
                      ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[4px_4px_0px_#F5F5F0] text-[#F5F5F0]'
                      : 'bg-white border-2 border-black shadow-[4px_4px_0px_#000000] text-black'
                  }`}
                >
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-65">
                    Reports &amp; Visuals
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={!snapshot.hasAnyObservations || isGeneratingPdf}
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      setActiveModal('report');
                    }}
                    title={pdfDesc}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left font-semibold transition-colors ${
                      !snapshot.hasAnyObservations
                        ? 'opacity-45 cursor-not-allowed'
                        : isMinimal
                        ? isDark
                          ? 'hover:bg-white/10 cursor-pointer'
                          : 'hover:bg-slate-100 cursor-pointer'
                        : isDark
                        ? 'hover:bg-[#262626] cursor-pointer'
                        : 'hover:bg-[#FFF8ED] cursor-pointer'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <FileDown className="w-3.5 h-3.5 shrink-0" />
                      <span>Report (PDF)</span>
                    </span>
                    <span className="text-[10px] opacity-65">
                      {snapshot.hasAnyObservations ? '30d' : 'No data yet'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={!snapshot.hasAnyObservations}
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      setActiveModal('heatmap');
                    }}
                    title={heatmapDesc}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left font-semibold transition-colors ${
                      !snapshot.hasAnyObservations
                        ? 'opacity-45 cursor-not-allowed'
                        : isMinimal
                        ? isDark
                          ? 'hover:bg-white/10 cursor-pointer'
                          : 'hover:bg-slate-100 cursor-pointer'
                        : isDark
                        ? 'hover:bg-[#262626] cursor-pointer'
                        : 'hover:bg-[#FFF8ED] cursor-pointer'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Grid className="w-3.5 h-3.5 shrink-0" />
                      <span>Heat Map</span>
                    </span>
                    <span className="text-[10px] opacity-65">
                      {snapshot.hasAnyObservations ? 'Day × Hr' : 'No data yet'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    disabled={!snapshot.hasAnyObservations}
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      setActiveModal('trends');
                    }}
                    title={trendsDesc}
                    className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left font-semibold transition-colors ${
                      !snapshot.hasAnyObservations
                        ? 'opacity-45 cursor-not-allowed'
                        : isMinimal
                        ? isDark
                          ? 'hover:bg-white/10 cursor-pointer'
                          : 'hover:bg-slate-100 cursor-pointer'
                        : isDark
                        ? 'hover:bg-[#262626] cursor-pointer'
                        : 'hover:bg-[#FFF8ED] cursor-pointer'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                      <span>Trends</span>
                    </span>
                    <span className="text-[10px] opacity-65">
                      {snapshot.hasAnyObservations ? `${snapshot.trackedDaysCount}d` : 'No data yet'}
                    </span>
                  </button>

                  <div className="my-1 border-t border-current/10" />
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider opacity-65">
                    Suggestions
                  </div>

                  {[...(isHomeState ? [] : primarySuggestionCards), ...secondaryPlusSuggestions].map(
                    (sug) => (
                      <button
                        key={sug.label}
                        type="button"
                        role="menuitem"
                        disabled={isPending}
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          handleSendMessage(sug.query, sug.metricId);
                        }}
                        className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left font-semibold transition-colors cursor-pointer disabled:opacity-45 ${
                          isMinimal
                            ? isDark
                              ? 'hover:bg-white/10'
                              : 'hover:bg-slate-100'
                            : isDark
                            ? 'hover:bg-[#262626]'
                            : 'hover:bg-[#FFF8ED]'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <MessageSquarePlus className="w-3.5 h-3.5 shrink-0 opacity-75" />
                          <span>{sug.label}</span>
                        </span>
                        <ArrowRight className="w-3 h-3 opacity-60" />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Right: 40px Voice mode circle + 40px Send/Stop circle */}
            <div className="flex items-center gap-2 shrink-0">
              {/* 40px Circular Persistent Voice Mode Toggle Button */}
              <div className="relative inline-flex items-center justify-center">
                <button
                  type="button"
                  data-testid="retis-voice-mode-btn"
                  data-voice-status={voiceSessionStatus}
                  disabled={isVoiceUnavailable}
                  onClick={toggleVoiceListening}
                  aria-pressed={isVoiceActiveOrRequesting}
                  aria-label={
                    isVoiceUnavailable
                      ? voiceBlockedReason || 'Voice mode unavailable'
                      : isVoiceActiveOrRequesting
                      ? 'Exit voice mode'
                      : 'Start voice mode'
                  }
                  title={
                    isVoiceUnavailable
                      ? voiceBlockedReason || 'Voice mode unavailable'
                      : isVoiceActiveOrRequesting
                      ? 'Exit voice mode (Esc)'
                      : 'Start voice mode'
                  }
                  style={
                    isVoiceActiveOrRequesting && !isVoiceUnavailable
                      ? {
                          backgroundColor: 'var(--theme-accent)',
                          color: 'var(--theme-accent-fg)',
                        }
                      : undefined
                  }
                  className={`relative z-10 retis-circle-btn retis-circle-btn-action rounded-full inline-flex items-center justify-center focus-visible:outline-2 ${
                    isVoiceUnavailable
                      ? `opacity-45 cursor-not-allowed ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/10 text-[#F5EDE4] border border-white/15'
                              : 'bg-slate-200 text-slate-600 border border-slate-300'
                            : isDark
                            ? 'bg-[#262626] text-[#A3A39E] border-2 border-[#F5F5F0]/50'
                            : 'bg-slate-200 text-black/50 border-2 border-black/40'
                        }`
                      : isVoiceActiveOrRequesting
                      ? `cursor-pointer ${
                          isMinimal
                            ? 'border border-white/25 shadow-sm'
                            : isDark
                            ? 'border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                            : 'border-2 border-black shadow-[2px_2px_0px_#000000]'
                        }`
                      : `cursor-pointer ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/[0.09] hover:bg-white/[0.16] text-[#F5EDE4] border border-white/[0.16]'
                              : 'bg-slate-100 hover:bg-slate-200/80 text-[#0F172A] border border-slate-300/80'
                            : isDark
                            ? 'bg-[#262626] hover:bg-[var(--vivid-accent,#D4FF3F)] hover:text-[#0D0D0D] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                            : 'bg-[#FFF8ED] hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000]'
                        }`
                  }`}
                >
                  {isVoiceUnavailable ? (
                    <MicOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <rect x="2" y="7" width="2" height="6" rx="1" />
                      <rect x="5.5" y="4.5" width="2" height="11" rx="1" />
                      <rect x="9" y="2.5" width="2" height="15" rx="1" />
                      <rect x="12.5" y="5" width="2" height="10" rx="1" />
                      <rect x="16" y="7.5" width="2" height="5" rx="1" />
                    </svg>
                  )}
                </button>
              </div>

              {/* 40px Circular Send / Stop Button (scales to 44px at 1600px+) */}
              {isPending ? (
                <button
                  type="button"
                  onClick={handleCancelRequest}
                  aria-label="Stop generating"
                  title="Stop generating"
                  style={{
                    backgroundColor: 'var(--theme-accent)',
                    color: 'var(--theme-accent-fg)',
                  }}
                  className={`retis-circle-btn retis-circle-btn-action rounded-full inline-flex items-center justify-center cursor-pointer focus-visible:outline-2 ${
                    isMinimal
                      ? 'border border-white/25 shadow-sm'
                      : isDark
                      ? 'border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                      : 'border-2 border-black shadow-[2px_2px_0px_#000000]'
                  }`}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="2" y="2" width="10" height="10" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!hasText}
                  aria-label="Send message"
                  title={hasText ? 'Send message' : 'Type a message to send'}
                  style={
                    hasText
                      ? {
                          backgroundColor: 'var(--theme-accent)',
                          color: 'var(--theme-accent-fg)',
                        }
                      : undefined
                  }
                  className={`retis-circle-btn retis-circle-btn-action rounded-full inline-flex items-center justify-center focus-visible:outline-2 ${
                    hasText
                      ? `cursor-pointer ${
                          isMinimal
                            ? 'border border-white/25 shadow-sm'
                            : isDark
                            ? 'border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                            : 'border-2 border-black shadow-[2px_2px_0px_#000000]'
                        }`
                      : `opacity-45 cursor-not-allowed ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/10 text-[#F5EDE4] border border-white/15'
                              : 'bg-slate-200 text-slate-600 border border-slate-300'
                            : isDark
                            ? 'bg-[#262626] text-[#A3A39E] border-2 border-[#F5F5F0]/50'
                            : 'bg-slate-200 text-black/50 border-2 border-black/40'
                        }`
                  }`}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="10" y1="15.5" x2="10" y2="4.5" />
                    <polyline points="5.2 9.2 10 4.4 14.8 9.2" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </form>

        {/* Below 1100px width, the standing disclaimer moves directly under the composer card */}
        <div
          className={`retis-disclaimer-under-composer items-center justify-center gap-1.5 mt-2 px-2 text-[12px] font-dm text-center ${
            isMinimal
              ? isDark
                ? 'text-[#B8AAA0]'
                : 'text-[#475569]'
              : isDark
              ? 'text-[#D4D4CE]'
              : 'text-[#1A1A1A]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: safeAccentTextHex }} />
          <span>
            IRIS provides screen-awareness suggestions and does not diagnose, treat, or prevent medical conditions.
          </span>
        </div>
      </div>
    );
  };

  // Render the 3 rectangular suggestion cards (Home state & Out-of-Scope redirect)
  const renderThreeSuggestionCards = () => (
    <div className="w-full flex flex-wrap items-center justify-center gap-3">
      {primarySuggestionCards.map((card) => (
        <button
          key={card.label}
          type="button"
          disabled={isPending}
          onClick={() => handleSendMessage(card.query, card.metricId)}
          className={`retis-suggestion-card cursor-pointer disabled:opacity-50 focus-visible:outline-2 ${
            isMinimal
              ? isDark
                ? 'font-medium bg-white/[0.08] hover:bg-white/[0.14] text-[#F5EDE4] border border-white/[0.14] shadow-xs'
                : 'font-medium bg-white/88 hover:bg-white text-[#0F172A] border border-white/95 shadow-xs'
              : isDark
              ? `font-extrabold ${card.vividBg} hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0]`
              : `font-extrabold ${card.vividBg} hover:bg-[#FFD84D] text-black border-2 border-black shadow-[3px_3px_0px_#000000]`
          }`}
        >
          {card.label}
        </button>
      ))}
    </div>
  );

  // Render the 3-group Footer (Left: real period + live status; Center: standing disclaimer; Right: Snapshot popover trigger)
  // At >1400px width, .retis-footer-inner aligns to the edges of the column (--chat-col) instead of window edges
  const renderThreeGroupFooter = () => (
    <footer className="w-full px-3 sm:px-5 py-1.5 shrink-0 relative z-20">
      <div className="retis-footer-inner flex items-center justify-between gap-3 text-[12px] font-dm">
        {/* Left: Real reporting period and monitoring status */}
        <div
          className={`flex items-center gap-2 font-semibold tabular-nums shrink-0 ${
            isMinimal
              ? isDark
                ? 'text-[#B8AAA0]'
                : 'text-[#475569]'
              : isDark
              ? 'text-[#D4D4CE]'
              : 'text-[#1A1A1A]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              snapshot.blinkStatus === 'Live'
                ? 'bg-emerald-500'
                : snapshot.blinkStatus === 'Paused'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }`}
          />
          <span>{snapshot.footerStatusLabel}</span>
        </div>

        {/* Center: Standing disclaimer (12px, secondary text color, never truncated; hidden below 1100px where it appears under composer) */}
        <div
          className={`retis-disclaimer-footer-center items-center justify-center gap-1.5 text-[12px] text-center ${
            isMinimal
              ? isDark
                ? 'text-[#B8AAA0]'
                : 'text-[#475569]'
              : isDark
              ? 'text-[#D4D4CE]'
              : 'text-[#1A1A1A]'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: safeAccentTextHex }} />
          <span>
            IRIS provides screen-awareness suggestions and does not diagnose, treat, or prevent medical conditions.
          </span>
        </div>

        {/* Right: Compact Snapshot Popover Trigger & Anchored Popover */}
        <div ref={snapshotPopoverRef} className="relative flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsSnapshotPopoverOpen((prev) => !prev)}
            aria-expanded={isSnapshotPopoverOpen}
            aria-controls="retis-snapshot-popover"
            aria-label="Open current readings snapshot"
            className={`px-3 py-1 rounded-full text-xs font-dm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
              isMinimal
                ? isDark
                  ? 'bg-white/[0.08] hover:bg-white/[0.15] text-[#F5EDE4] border border-white/[0.15]'
                  : 'bg-white/90 hover:bg-white text-[#0F172A] border border-slate-200/90 shadow-2xs'
                : isDark
                ? 'bg-[#1F1F1F] hover:bg-[#262626] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] font-bold'
                : 'bg-white hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] font-bold'
            }`}
          >
            <span>Snapshot</span>
            <span className="tabular-nums font-bold" style={{ color: safeAccentTextHex }}>
              {snapshot.displayBlinkRate !== null ? `${snapshot.displayBlinkRate} BPM` : '--'}
            </span>
            <span>·</span>
            <span className="tabular-nums font-bold" style={{ color: safeAccentTextHex }}>
              {snapshot.displayDistance !== null ? `${snapshot.displayDistance} cm` : '--'}
            </span>
            {isSnapshotPopoverOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>

          {isSnapshotPopoverOpen && (
            <div
              id="retis-snapshot-popover"
              role="dialog"
              aria-label="Current readings snapshot"
              style={{
                width: 'min(420px, calc(100vw - 32px))',
                maxHeight: '60vh',
              }}
              className={`animate-dropdown-enter absolute right-0 bottom-10 rounded-3xl p-4 overflow-y-auto z-50 flex flex-col gap-2.5 text-xs font-dm ${
                isMinimal
                  ? isDark
                    ? 'bg-[#1C140F] border border-white/15 text-[#F5EDE4] shadow-2xl'
                    : 'bg-white border border-slate-200/95 text-[#0F172A] shadow-2xl'
                  : isDark
                  ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[6px_6px_0px_#F5F5F0] text-[#F5F5F0]'
                  : 'bg-[#FFF8ED] border-2 border-black shadow-[6px_6px_0px_#000000] text-black'
              }`}
            >
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-current/15">
                <div>
                  <span className="font-bold text-xs uppercase tracking-wider block">
                    Live Snapshot (7 Metrics)
                  </span>
                  <span className="text-[11px] opacity-75">
                    {snapshot.footerStatusLabel}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSnapshotPopoverOpen(false)}
                  aria-label="Close Snapshot popover"
                  className="p-1 rounded-full hover:opacity-80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {snapshotMetricsList.map((m) => (
                  <div
                    key={m.id}
                    className="tactile-inner p-2.5 rounded-2xl flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold">
                        <span style={{ color: safeAccentTextHex }}>{m.icon}</span>
                        <span>{m.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{ color: safeAccentTextHex }}
                        >
                          {m.valueNode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isMinimal
                              ? isDark
                                ? 'bg-white/10 text-[#F5EDE4]'
                                : 'bg-slate-200/80 text-[#0F172A]'
                              : isDark
                              ? 'bg-[#262626] text-[#F5F5F0] border border-[#F5F5F0]'
                              : 'bg-white text-black border border-black'
                          }`}
                        >
                          {m.statusPill}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px] opacity-85 leading-snug">{m.subline1}</div>
                    <div className="flex items-center justify-between gap-2 text-[11px] opacity-75">
                      <span>{m.subline2}</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          setIsSnapshotPopoverOpen(false);
                          handleSendMessage(m.question, m.id);
                        }}
                        className="font-bold underline hover:opacity-100 cursor-pointer shrink-0"
                        style={{ color: safeAccentTextHex }}
                      >
                        Ask RETIS
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </footer>
  );

  return (
    <div
      data-history-open={isHistoryOpen}
      className="retis-screen-root relative w-full h-full flex-1 min-h-0 overflow-hidden flex flex-row box-border select-none"
    >
      {/* Mobile/Compact Scrim when History Drawer is Open below 1100px */}
      {isHistoryOpen && (
        <div
          onClick={() => toggleHistoryPanel(false)}
          aria-hidden="true"
          className="fixed inset-0 bg-black/40 z-30 min-[1100px]:hidden"
        />
      )}

      {/* ================================================================== */}
      {/* COLLAPSIBLE LEFT CHAT HISTORY PANEL (264px wide)                   */}
      {/* ================================================================== */}
      {isHistoryOpen && (
        <aside
          aria-label="Chat history"
          className={`w-[264px] shrink-0 h-full flex flex-col justify-between p-3 z-40 max-[1099px]:fixed max-[1099px]:left-0 max-[1099px]:top-[var(--iris-top-nav-height,80px)] max-[1099px]:h-[calc(100dvh-var(--iris-top-nav-height,80px))] ${
            isMinimal
              ? isDark
                ? 'bg-[#19120D] border-r border-white/[0.12] text-[#F5EDE4]'
                : 'bg-[#F2F6FC] border-r border-slate-200/90 text-[#0F172A]'
              : isDark
              ? 'bg-[#1A1A1A] border-r-2 border-[#F5F5F0] text-[#F5F5F0]'
              : 'bg-[#FFFDF9] border-r-2 border-black text-black'
          }`}
        >
          {/* Top Controls: Header + Collapse + New Chat + Local Search */}
          <div className="flex flex-col gap-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-dm text-xs font-bold uppercase tracking-wider opacity-80">
                Chat History (30d)
              </span>
              <button
                type="button"
                onClick={() => toggleHistoryPanel(false)}
                aria-label="Collapse chat history panel"
                title="Hide chat history"
                className="p-1.5 rounded-xl hover:bg-current/10 cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleStartNewChat}
              className="btn-pill-primary !py-2 !px-3.5 !text-xs w-full justify-center cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New chat</span>
            </button>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none" />
              <input
                type="search"
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                placeholder="Search saved chats..."
                aria-label="Search saved chats"
                className={`w-full pl-8 pr-3 py-1.5 rounded-xl text-xs font-dm focus:outline-none ${
                  isMinimal
                    ? isDark
                      ? 'bg-white/[0.07] border border-white/[0.14] text-[#F5EDE4] placeholder:text-[#94867B]'
                      : 'bg-white border border-slate-200/90 text-[#0F172A] placeholder:text-slate-400'
                    : isDark
                    ? 'bg-[#262626] border-2 border-[#F5F5F0] text-[#F5F5F0] placeholder:text-[#A3A39E]'
                    : 'bg-white border-2 border-black text-black placeholder:text-black/50'
                }`}
              />
            </div>

            {!storageAvailable && (
              <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] font-dm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>History unavailable (in-memory only)</span>
              </div>
            )}
          </div>

          {/* Scrollable Saved Chats List */}
          <div className="flex-1 min-h-0 overflow-y-auto my-2.5 pr-0.5 space-y-3">
            {groupedHistory.length === 0 ? (
              <div className="py-8 px-3 text-center text-xs font-dm opacity-70">
                No saved chats yet
              </div>
            ) : (
              groupedHistory.map((groupBucket) => (
                <div key={groupBucket.group} className="space-y-1">
                  <div className="px-2 text-[10px] font-dm font-bold uppercase tracking-wider opacity-60">
                    {groupBucket.group}
                  </div>
                  {groupBucket.chats.map((chat) => {
                    const isSelected = activeSessionId === chat.id && viewMode === 'conversation';
                    const isRenaming = renamingSessionId === chat.id;
                    const isConfirmingDelete = confirmDeleteSessionId === chat.id;
                    const timeLabel = new Date(
                      chat.updatedAt || chat.createdAt
                    ).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    });

                    return (
                      <div
                        key={chat.id}
                        className={`group rounded-xl p-2 text-xs font-dm transition-colors ${
                          isSelected
                            ? isMinimal
                              ? isDark
                                ? 'bg-white/[0.14] border border-white/20 font-semibold'
                                : 'bg-white border border-slate-300 shadow-2xs font-semibold'
                              : isDark
                              ? 'bg-[#262626] border-2 border-[var(--vivid-accent,#D4FF3F)] font-bold'
                              : 'bg-[#FFD84D] border-2 border-black font-bold'
                            : isMinimal
                            ? isDark
                              ? 'hover:bg-white/[0.07]'
                              : 'hover:bg-white/70'
                            : isDark
                            ? 'hover:bg-[#242424]'
                            : 'hover:bg-[#FFF8ED]'
                        }`}
                      >
                        {isRenaming ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameSession(chat.id);
                                if (e.key === 'Escape') setRenamingSessionId(null);
                              }}
                              autoFocus
                              aria-label="Edit chat title"
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-black/10 dark:bg-white/10 text-xs focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleRenameSession(chat.id)}
                              aria-label="Save chat title"
                              className="p-1 rounded hover:opacity-80 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingSessionId(null)}
                              aria-label="Cancel rename"
                              className="p-1 rounded hover:opacity-80 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : isConfirmingDelete ? (
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[11px] font-semibold text-red-500">
                              Delete this chat?
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteSession(chat.id)}
                                className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSessionId(null)}
                                className="px-2 py-0.5 rounded bg-current/10 text-[10px] font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSelectSavedSession(chat)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <span className="block truncate">{chat.title}</span>
                              <span className="block text-[10px] opacity-65 tabular-nums">
                                {timeLabel} · {chat.messages.length} msgs
                              </span>
                            </button>
                            <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setRenamingSessionId(chat.id);
                                  setRenameDraft(chat.title);
                                }}
                                aria-label={`Rename ${chat.title}`}
                                title="Rename chat"
                                className="p-1 rounded hover:bg-current/10 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteSessionId(chat.id)}
                                aria-label={`Delete ${chat.title}`}
                                title="Delete chat"
                                className="p-1 rounded hover:bg-current/10 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Bottom of History Panel: Clear all history with inline confirmation */}
          <div className="pt-2 border-t border-current/15 shrink-0">
            {confirmClearAllHistory ? (
              <div className="flex items-center justify-between gap-2 text-xs font-dm">
                <span className="font-semibold text-red-500 text-[11px]">Clear all chats?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClearAllSessions}
                    className="px-2.5 py-1 rounded-lg bg-red-500 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAllHistory(false)}
                    className="px-2.5 py-1 rounded-lg bg-current/10 text-[11px] font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={savedSessions.length === 0}
                onClick={() => setConfirmClearAllHistory(true)}
                className="w-full py-1.5 px-2.5 rounded-xl text-xs font-dm font-semibold flex items-center justify-center gap-1.5 opacity-80 hover:opacity-100 hover:bg-current/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear all history</span>
              </button>
            )}
          </div>
        </aside>
      )}

      {/* ================================================================== */}
      {/* MAIN COLUMN (Home/Conversation State + Footer)                     */}
      {/* ================================================================== */}
      <div className="retis-main-column flex-1 min-w-0 min-h-0 h-full flex flex-col justify-between overflow-hidden">
        {viewMode === 'home' ? (
          /* ================================================================ */
          /* STATE A: HOME STATE                                              */
          /* ================================================================ */
          <>
            {/* Minimal Top Utility Bar in Home State: History Toggle + New Chat */}
            <div className="w-full flex items-center justify-between gap-2 px-3 sm:px-5 pt-1 shrink-0">
              <div className="flex items-center gap-2">
                {!isHistoryOpen && (
                  <button
                    type="button"
                    onClick={() => toggleHistoryPanel(true)}
                    aria-label="Open chat history"
                    title="Open saved chats"
                    className={`px-3 py-1.5 rounded-full text-xs font-dm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isMinimal
                        ? isDark
                          ? 'bg-white/[0.08] hover:bg-white/[0.14] text-[#F5EDE4] border border-white/[0.15]'
                          : 'bg-white/88 hover:bg-white text-[#0F172A] border border-slate-200/90 shadow-2xs'
                        : isDark
                        ? 'bg-[#1F1F1F] hover:bg-[#262626] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] font-bold'
                        : 'bg-white hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] font-bold'
                    }`}
                  >
                    <PanelLeft className="w-3.5 h-3.5" />
                    <span>History</span>
                    {savedSessions.length > 0 && (
                      <span className="opacity-75 tabular-nums">({savedSessions.length})</span>
                    )}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onOpenCalibration && (
                  <button
                    type="button"
                    onClick={onOpenCalibration}
                    className={`px-3 py-1.5 rounded-full text-xs font-dm font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isMinimal
                        ? isDark
                          ? 'bg-white/[0.08] hover:bg-white/[0.14] text-[#F5EDE4] border border-white/[0.15]'
                          : 'bg-white/88 hover:bg-white text-[#0F172A] border border-slate-200/90 shadow-2xs'
                        : isDark
                        ? 'bg-[#1F1F1F] hover:bg-[#262626] text-[#F5F5F0] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0] font-bold'
                        : 'bg-white hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000] font-bold'
                    }`}
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>
                      {telemetry.isCalibrated ? 'Recalibrate Distance' : 'Calibrate Distance'}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Optically Centered Home Content Column (~46% from top, 54% to bottom) */}
            <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden">
              <div className="flex-[0.46] min-h-0" />

              <div className="retis-home-column flex flex-col items-center text-center shrink-0">
                {/* Large Unmodified RETIS Mascot (clamp(104px, 17vh, 156px)) */}
                <div
                  className={`retis-mascot-home flex items-center justify-center shrink-0 ${
                    isDark ? 'rounded-[28px] p-1.5' : ''
                  }`}
                >
                  <img
                    src={RETIS_MASCOT_SRC}
                    alt="RETIS screen-habits reporter mascot"
                    draggable={false}
                    className="w-full h-full object-contain select-none"
                  />
                </div>

                {/* Large Two-Part Greeting Heading: "Hello, <first name>" */}
                <h1
                  className={`retis-home-heading retis-gap-mascot-heading font-cormorant tracking-tight ${
                    isMinimal
                      ? isDark
                        ? 'font-normal text-[#F5EDE4]'
                        : 'font-normal text-[#0F172A]'
                      : isDark
                      ? 'font-bold text-[#F5F5F0]'
                      : 'font-bold text-black'
                  }`}
                >
                  Hello,{' '}
                  <span
                    className="italic font-semibold"
                    style={{ color: safeAccentTextHex }}
                  >
                    {firstName}
                  </span>
                </h1>

                {/* Clean Status Line (14px, secondary text color, no stray periods or nested parentheses) */}
                <div
                  className={`retis-gap-heading-status flex flex-wrap items-center justify-center gap-2 text-[14px] font-dm ${
                    isMinimal
                      ? isDark
                        ? 'text-[#B8AAA0]'
                        : 'text-[#475569]'
                      : isDark
                      ? 'text-[#D4D4CE]'
                      : 'text-[#1A1A1A]'
                  }`}
                >
                  <span>{snapshot.homeStatusLine}</span>
                </div>



                {/* Large Composer Card with Highlighted Focus Ring */}
                <div className="retis-gap-status-composer retis-composer-dock w-full text-left">
                  {renderComposerCard(true)}
                </div>

                {/* Centered Row of 3 Rectangular Suggestion Cards */}
                <div className="retis-gap-composer-chips w-full">
                  {renderThreeSuggestionCards()}
                </div>
              </div>

              <div className="flex-[0.54] min-h-0" />
            </div>

            {/* 3-Group Footer */}
            {renderThreeGroupFooter()}
          </>
        ) : (
          /* ================================================================ */
          /* STATE B: CONVERSATION STATE                                      */
          /* ================================================================ */
          <>
            {/* 1. Opaque Non-Overlapping Top Toolbar (fixes Defect b) */}
            <div className="retis-toolbar-column retis-thread-column shrink-0 mt-1">
              <div className="retis-conv-toolbar w-full flex items-center justify-between gap-2 py-2 px-3.5 rounded-2xl">
                {/* Left: History Toggle + New Chat Icon + 44px Mascot + Single-Line Chat Title */}
                <div className="flex items-center gap-2 min-w-0">
                  {!isHistoryOpen && (
                    <button
                      type="button"
                      onClick={() => toggleHistoryPanel(true)}
                      aria-label="Open chat history"
                      title="Open chat history"
                      className="p-2 rounded-xl hover:bg-current/10 cursor-pointer shrink-0"
                    >
                      <PanelLeft className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleStartNewChat}
                    aria-label="New chat"
                    title="Start a new chat"
                    className="p-2 rounded-xl hover:bg-current/10 cursor-pointer shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewMode('home')}
                    title="Return to RETIS greeting screen"
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer focus-visible:outline-2 rounded-xl pr-2"
                  >
                    {/* Fluid Mascot in Conversation Toolbar (clamp(44px, 3.2vw, 56px)) */}
                    <div
                      className={`retis-toolbar-mascot rounded-xl p-1 flex items-center justify-center shrink-0 ${
                        isMinimal
                          ? isDark
                            ? 'bg-white/[0.08] border border-white/[0.16]'
                            : 'bg-white border border-slate-200/90 shadow-2xs'
                          : isDark
                          ? 'bg-[#F7F5EE] border-2 border-[#0D0D0D]'
                          : 'bg-[#FFF8ED] border-2 border-black'
                      }`}
                    >
                      <img
                        src={RETIS_MASCOT_SRC}
                        alt="RETIS"
                        draggable={false}
                        className="w-full h-full object-contain select-none"
                      />
                    </div>
                    <div className="min-w-0">
                      <span className="font-dm text-sm font-bold block truncate">
                        {activeChatTitle}
                      </span>
                      <span className="font-dm text-[11px] opacity-70 block truncate">
                        RETIS
                      </span>
                    </div>
                  </button>
                </div>

                {/* Right: Connection Dot (dot alone when Connected; label only when Not configured/Offline/Error/Voice) + Overflow ... Menu */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={connectionState === 'not_configured' ? onOpenPreferences : undefined}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-dm font-semibold transition-colors ${
                      connectionState === 'not_configured'
                        ? 'cursor-pointer hover:bg-amber-500/20 text-amber-500'
                        : ''
                    }`}
                    title={
                      connectionState === 'not_configured'
                        ? 'Click to configure Google AI Pro / Gemini API key in Preferences'
                        : connectionBadgeLabel[connectionState]
                    }
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        connectionState === 'connected' || connectionState === 'standby'
                          ? 'bg-emerald-500'
                          : connectionState === 'not_configured'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                    />
                    {connectionState !== 'connected' && connectionState !== 'standby' && (
                      <span>{connectionBadgeLabel[connectionState]}</span>
                    )}
                  </button>

                  {/* Overflow (...) Menu: Recalibrate Distance & Delete chat */}
                  <div ref={convOverflowRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setIsConvOverflowOpen((prev) => !prev)}
                      aria-label="Conversation options"
                      aria-expanded={isConvOverflowOpen}
                      aria-haspopup="menu"
                      title="Conversation options"
                      className="p-2 rounded-xl hover:bg-current/10 cursor-pointer"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>

                    {isConvOverflowOpen && (
                      <div
                        role="menu"
                        className={`animate-dropdown-enter absolute right-0 top-10 w-52 rounded-2xl p-1.5 z-50 flex flex-col gap-1 text-xs font-dm ${
                          isMinimal
                            ? isDark
                              ? 'bg-[#1C140F] border border-white/15 text-[#F5EDE4] shadow-2xl'
                              : 'bg-white border border-slate-200/95 text-[#0F172A] shadow-xl'
                            : isDark
                            ? 'bg-[#1F1F1F] border-2 border-[#F5F5F0] shadow-[4px_4px_0px_#F5F5F0] text-[#F5F5F0]'
                            : 'bg-white border-2 border-black shadow-[4px_4px_0px_#000000] text-black'
                        }`}
                      >
                        {onOpenCalibration && (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsConvOverflowOpen(false);
                              onOpenCalibration();
                            }}
                            className="w-full px-3 py-2 rounded-xl flex items-center gap-2 text-left font-semibold hover:bg-current/10 cursor-pointer"
                          >
                            <Ruler className="w-3.5 h-3.5 shrink-0" />
                            <span>Recalibrate Distance</span>
                          </button>
                        )}
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (activeSessionId) {
                              handleDeleteSession(activeSessionId);
                            } else {
                              handleStartNewChat();
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl flex items-center gap-2 text-left font-semibold text-red-500 hover:bg-red-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Delete chat</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Scrolling Message Thread (flex: 1; min-height: 0; overflow-y: auto; max-width: 820px) */}
            <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden my-1.5">
              <div
                ref={threadContainerRef}
                onScroll={handleThreadScroll}
                aria-live="polite"
                aria-relevant="additions text"
                className="retis-thread-column flex-1 min-h-0 overflow-y-auto space-y-4 py-2 px-1 select-text"
              >
                {messages.map((msg) => {
                  const isAssistant = msg.role === 'assistant';

                  if (!isAssistant) {
                    return (
                      <div
                        key={msg.id}
                        className="retis-user-msg-enter flex flex-col items-end w-full"
                      >
                        <div
                          style={{ maxWidth: '68%' }}
                          className={`rounded-3xl px-4 py-3 shadow-xs break-words [overflow-wrap:anywhere] font-dm ${
                            isMinimal
                              ? isDark
                                ? 'bg-[var(--theme-accent,#FF7A1A)] text-[var(--theme-accent-fg,#0D0D0D)] font-semibold'
                                : 'bg-[#111827] text-white font-medium'
                              : isDark
                              ? 'bg-[#55C7F2] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] font-bold'
                              : 'bg-[#55C7F2] text-black border-2 border-black shadow-[3px_3px_0px_#000000] font-bold'
                          }`}
                        >
                          <p
                            className="whitespace-pre-wrap"
                            style={{
                              fontSize: 'var(--retis-body-font)',
                              lineHeight: 'var(--retis-body-lh)',
                            }}
                          >
                            {msg.content}
                          </p>
                          <span
                            className="inline-flex items-center justify-end gap-1 w-full opacity-75 mt-1 text-right tabular-nums"
                            style={{ fontSize: 'var(--retis-sub-font)' }}
                          >
                            {msg.isVoice && (
                              <Mic className="w-3 h-3 inline-block shrink-0" aria-hidden="true" />
                            )}
                            <span>{msg.isVoice ? `Voice · ${msg.timestamp}` : msg.timestamp}</span>
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Assistant Error Card (with Retry + Local Snapshot Metric Values)
                  if (msg.isError) {
                    return (
                      <div
                        key={msg.id}
                        className="retis-response-card-expand flex items-start gap-3 w-full"
                      >
                        <div className="retis-thread-avatar rounded-2xl tactile-inner p-1 flex items-center justify-center shrink-0">
                          <img
                            src={RETIS_MASCOT_SRC}
                            alt="RETIS"
                            draggable={false}
                            className="w-full h-full object-contain select-none"
                          />
                        </div>
                        <div
                          className={`flex-1 min-w-0 max-w-full rounded-3xl p-4 sm:p-5 ${
                            isMinimal
                              ? isDark
                                ? 'bg-white/[0.08] border border-amber-500/40 text-[#F5EDE4]'
                                : 'bg-white/95 border border-amber-500/40 text-[#0F172A]'
                              : isDark
                              ? 'bg-[#242424] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#F5F5F0]'
                              : 'bg-[#FFF8ED] border-2 border-black shadow-[3px_3px_0px_#000000] text-black'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-current/15">
                            <span className="font-dm text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                              <span>Request Error — Local Snapshot Values Shown</span>
                            </span>
                            <span
                              className="font-dm opacity-75 tabular-nums"
                              style={{ fontSize: 'var(--retis-sub-font)' }}
                            >
                              {msg.timestamp}
                            </span>
                          </div>

                          <p
                            className="font-dm font-semibold mb-3 max-w-[80ch] break-words"
                            style={{
                              fontSize: 'var(--retis-body-font)',
                              lineHeight: 'var(--retis-body-lh)',
                            }}
                          >
                            {msg.content}
                          </p>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                            {(
                              [
                                'blink_rate_bpm',
                                'screen_distance_cm',
                                'total_validated_blinks',
                                'blink_alerts_count',
                                'distance_warnings_count',
                                'longest_session_hours',
                              ] as RetisMetricId[]
                            ).map((id) => {
                              const frozenItem = msg.frozenMetrics?.[id];
                              const entry = snapshot.metricEntries[id];
                              const label = frozenItem ? frozenItem.label : entry.label;
                              const value = frozenItem ? frozenItem.value : entry.formattedValue;
                              return (
                                <div
                                  key={id}
                                  style={{ fontSize: 'calc(var(--retis-body-font) * 0.88)' }}
                                  className="tactile-inner p-2 rounded-xl font-dm"
                                >
                                  <span className="block text-[10px] uppercase font-bold opacity-75">
                                    {label}
                                  </span>
                                  <span
                                    className="font-bold tabular-nums"
                                    style={{ color: safeAccentTextHex }}
                                  >
                                    {value}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-current/15">
                            <span
                              className="font-dm opacity-80"
                              style={{ fontSize: 'var(--retis-sub-font)' }}
                            >
                              Based on: {snapshot.reportingPeriodLabel} ·{' '}
                              {snapshot.observedDurationFormatted} observed
                            </span>
                            {msg.retryQuery && (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                  handleSendMessage(msg.retryQuery, msg.retryMetricId)
                                }
                                className="btn-pill-primary !py-1 !px-3.5 !text-xs cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Retry</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Out-of-Scope Redirect Card (when msg.isOffTopic or msg.structured?.outOfScope is true)
                  const isOutOfScopeCard = Boolean(msg.isOffTopic || msg.structured?.outOfScope);

                  if (isOutOfScopeCard) {
                    return (
                      <div
                        key={msg.id}
                        className="retis-response-card-expand flex items-start gap-3 w-full"
                      >
                        {/* Fluid Mascot Avatar */}
                        <div
                          className={`retis-thread-avatar rounded-2xl p-1 flex items-center justify-center shrink-0 ${
                            isMinimal
                              ? isDark
                                ? 'bg-white/[0.08] border border-white/[0.16]'
                                : 'bg-white border border-slate-200/90 shadow-2xs'
                              : isDark
                              ? 'bg-[#F7F5EE] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                              : 'bg-[#FFF8ED] border-2 border-black shadow-[2px_2px_0px_#000000]'
                          }`}
                        >
                          <img
                            src={RETIS_MASCOT_SRC}
                            alt="RETIS"
                            draggable={false}
                            className="w-full h-full object-contain select-none"
                          />
                        </div>

                        <div className="flex-1 min-w-0 max-w-full flex flex-col gap-2.5">
                          <div
                            className={
                              isMinimal
                                ? isDark
                                  ? 'rounded-3xl p-4 sm:p-5 bg-white/[0.08] border border-white/[0.14] text-[#F5EDE4]'
                                  : 'rounded-3xl p-4 sm:p-5 bg-white/92 border border-white/95 shadow-xs text-[#0F172A]'
                                : isDark
                                ? 'rounded-3xl p-4 sm:p-5 bg-[#242424] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#F5F5F0]'
                                : 'rounded-3xl p-4 sm:p-5 bg-[#FFF8ED] border-2 border-black shadow-[3px_3px_0px_#000000] text-black'
                            }
                          >
                            <div className="retis-stagger-block-1 flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-current/15">
                              <span className="font-dm text-xs font-bold uppercase tracking-wider">
                                RETIS
                              </span>
                              <span
                                className="font-dm opacity-75 tabular-nums"
                                style={{ fontSize: 'var(--retis-sub-font)' }}
                              >
                                {msg.timestamp}
                              </span>
                            </div>

                            <div
                              className="retis-stagger-block-1 font-dm max-w-[80ch] break-words"
                              style={{
                                fontSize: 'var(--retis-body-font)',
                                lineHeight: 'var(--retis-body-lh)',
                              }}
                            >
                              <WordGroupRevealText
                                text={msg.content || RETIS_OUT_OF_SCOPE_REDIRECT_TEXT}
                                animate={Boolean(msg.isFreshReply)}
                              />
                            </div>
                          </div>

                          {/* 3 Clickable Suggestion Chips directly under the redirect reply */}
                          <div className="retis-stagger-block-2 flex flex-wrap items-center gap-2">
                            {primarySuggestionCards.map((chip) => (
                              <button
                                key={chip.label}
                                type="button"
                                disabled={isPending}
                                onClick={() => handleSendMessage(chip.query, chip.metricId)}
                                className={`retis-suggestion-card !h-9 !px-4 !text-xs cursor-pointer disabled:opacity-50 ${
                                  isMinimal
                                    ? isDark
                                      ? 'font-medium bg-white/[0.08] hover:bg-white/[0.14] text-[#F5EDE4] border border-white/[0.14]'
                                      : 'font-medium bg-white/90 hover:bg-white text-[#0F172A] border border-slate-200/90 shadow-2xs'
                                    : isDark
                                    ? `font-extrabold ${chip.vividBg} hover:bg-[var(--vivid-accent,#D4FF3F)] text-[#0D0D0D] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]`
                                    : `font-extrabold ${chip.vividBg} hover:bg-[#FFD84D] text-black border-2 border-black shadow-[2px_2px_0px_#000000]`
                                }`}
                              >
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Standard RETIS Report-Style Response Card
                  const displayContent = msg.structured
                    ? substituteSnapshotTokens(
                        msg.structured.answer || msg.structured.answerTemplate,
                        snapshot,
                        msg.frozenMetrics
                      )
                    : msg.content;
                  const metricsUsed = msg.structured?.metricsUsed || [
                    'blink_rate_bpm',
                    'screen_distance_cm',
                    'observed_duration',
                  ];
                  const suggestedAction = msg.structured?.suggestedAction || 'none';
                  const hasDataLimitations = Boolean(
                    msg.structured?.dataLimitations && msg.structured.dataLimitations.trim()
                  );
                  const isDataNotesOpen = Boolean(expandedDataNotesIds[msg.id]);

                  return (
                    <div
                      key={msg.id}
                      className="retis-response-card-expand flex items-start gap-3 w-full"
                    >
                      {/* Fluid Mascot Avatar (clamp(40px, 3vw, 52px)) */}
                      <div
                        className={`retis-thread-avatar rounded-2xl p-1 flex items-center justify-center shrink-0 ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/[0.08] border border-white/[0.16]'
                              : 'bg-white border border-slate-200/90 shadow-2xs'
                            : isDark
                            ? 'bg-[#F7F5EE] border-2 border-[#F5F5F0] shadow-[2px_2px_0px_#F5F5F0]'
                            : 'bg-[#FFF8ED] border-2 border-black shadow-[2px_2px_0px_#000000]'
                        }`}
                      >
                        <img
                          src={RETIS_MASCOT_SRC}
                          alt="RETIS"
                          draggable={false}
                          className="w-full h-full object-contain select-none"
                        />
                      </div>

                      <div
                        className={`flex-1 min-w-0 max-w-full rounded-3xl p-4 sm:p-5 ${
                          isMinimal
                            ? isDark
                              ? 'bg-white/[0.08] border border-white/[0.14] text-[#F5EDE4]'
                              : 'bg-white/92 border border-white/95 shadow-xs text-[#0F172A]'
                            : isDark
                            ? 'bg-[#242424] border-2 border-[#F5F5F0] shadow-[3px_3px_0px_#F5F5F0] text-[#F5F5F0]'
                            : 'bg-[#FFF8ED] border-2 border-black shadow-[3px_3px_0px_#000000] text-black'
                        }`}
                      >
                        {/* Block 1: Header ("RETIS" label only — no duplicate "AI-generated summary" pill) + Prose */}
                        <div className="retis-stagger-block-1 flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-current/15">
                          <div className="flex items-center gap-2">
                            <span className="font-dm text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5">
                              <span>RETIS</span>
                              {msg.isVoice && (
                                <span className="inline-flex items-center gap-1 text-[10px] opacity-80">
                                  <Volume2 className="w-3 h-3" />
                                  <span>Voice</span>
                                </span>
                              )}
                              {(msg.interrupted || msg.structured?.interrupted) && (
                                <span
                                  data-testid="retis-msg-interrupted-badge"
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                >
                                  Interrupted
                                </span>
                              )}
                            </span>
                          </div>
                          <span
                            className="font-dm opacity-75 tabular-nums"
                            style={{ fontSize: 'var(--retis-sub-font)' }}
                          >
                            {msg.timestamp}
                          </span>
                        </div>

                        <div
                          className="retis-stagger-block-1 font-dm space-y-2 whitespace-pre-wrap max-w-[80ch] break-words"
                          style={{
                            fontSize: 'var(--retis-body-font)',
                            lineHeight: 'var(--retis-body-lh)',
                          }}
                        >
                          <WordGroupRevealText
                            text={displayContent}
                            animate={Boolean(msg.isFreshReply)}
                          />
                        </div>

                        {/* Block 2: Referenced Metric Chips (using frozen values from creation time & text-safe accent token >= 4.5:1) */}
                        {metricsUsed.length > 0 && (
                          <div className="retis-stagger-block-2 flex flex-wrap items-center gap-1.5 mt-3.5 pt-2.5 border-t border-current/10">
                            {metricsUsed.map((metricId) => {
                              const frozenItem = msg.frozenMetrics?.[metricId];
                              const entry = snapshot.metricEntries[metricId];
                              if (!frozenItem && !entry) return null;
                              const chipLabel = frozenItem ? frozenItem.label : entry.label;
                              const chipValue = frozenItem
                                ? frozenItem.value
                                : entry.formattedValue;
                              return (
                                <div
                                  key={metricId}
                                  style={{ fontSize: 'calc(var(--retis-body-font) * 0.88)' }}
                                  className="tactile-inner px-2.5 py-1 rounded-xl font-dm inline-flex items-center gap-1.5"
                                >
                                  <span className="opacity-75 font-semibold">{chipLabel}:</span>
                                  <span
                                    className="font-bold tabular-nums"
                                    style={{ color: safeAccentTextHex }}
                                  >
                                    {chipValue}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Block 3: One-line Collapsible "Data notes" Disclosure when data_limitations is non-empty */}
                        {hasDataLimitations && (
                          <div className="retis-stagger-block-3 mt-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDataNotesIds((prev) => ({
                                  ...prev,
                                  [msg.id]: !prev[msg.id],
                                }))
                              }
                              aria-expanded={isDataNotesOpen}
                              style={{ fontSize: 'max(12px, calc(var(--retis-body-font) * 0.82))' }}
                              className="inline-flex items-center gap-1 font-dm font-semibold opacity-75 hover:opacity-100 cursor-pointer"
                            >
                              <span>Data notes</span>
                              {isDataNotesOpen ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                            {isDataNotesOpen && (
                              <p
                                className="mt-1 font-dm opacity-75 leading-relaxed max-w-[80ch]"
                                style={{ fontSize: 'max(12px, calc(var(--retis-body-font) * 0.82))' }}
                              >
                                {msg.structured?.dataLimitations}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Block 4: Single Footer Line ("Based on: <period> · <observed time> observed" + "· AI-generated summary" when source !== 'local') + Optional Action Button */}
                        <div className="retis-stagger-block-4 mt-3 pt-2.5 border-t border-current/15 flex flex-wrap items-center justify-between gap-3">
                          <div
                            className="flex flex-wrap items-center gap-1.5 font-dm font-semibold opacity-80 tabular-nums"
                            style={{ fontSize: 'var(--retis-sub-font)' }}
                          >
                            <span>
                              Based on:{' '}
                              {msg.structured?.dataPeriod || snapshot.reportingPeriodLabel} ·{' '}
                              {msg.structured?.observedDurationLabel ||
                                snapshot.observedDurationFormatted}{' '}
                              observed
                              {msg.source === 'local' || msg.structured?.source === 'local'
                                ? ''
                                : ' · AI-generated summary'}
                            </span>
                          </div>

                          {suggestedAction !== 'none' && (
                            <button
                              type="button"
                              onClick={() => handleExecuteSuggestedAction(suggestedAction)}
                              className="btn-pill-primary !py-1.5 !px-3.5 !text-xs cursor-pointer"
                            >
                              <span>{suggestedActionLabels[suggestedAction]}</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pending Notepad Writing Indicator inside the thread as the last entry */}
                {isPending && renderNotepadWritingIndicator()}

                <div ref={messagesEndRef} />
              </div>

              {/* Floating "Jump to latest" pill when user has scrolled up */}
              {!isThreadNearBottom && messages.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToLatestMessage}
                  className="btn-pill-primary !py-1.5 !px-4 !text-xs absolute bottom-3 left-1/2 -translate-x-1/2 z-20 cursor-pointer"
                >
                  <span>Jump to latest</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 3. Docked Composer */}
            <div className="retis-composer-column retis-thread-column shrink-0 flex flex-col">
              <div className="retis-composer-dock w-full">
                {renderComposerCard(false)}
              </div>
            </div>

            {/* 4. 3-Group Footer */}
            {renderThreeGroupFooter()}
          </>
        )}
      </div>

      {/* ================================================================== */}
      {/* MODAL 1: MONTHLY REPORT (PDF) PREVIEW & DOWNLOAD                   */}
      {/* ================================================================== */}
      {activeModal === 'report' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retis-pdf-report-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="glass-modal w-full max-w-4xl rounded-[32px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto flex flex-col gap-6">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-current/15">
              <div>
                <span className="glass-badge text-[10px] uppercase tracking-wider">
                  30-Day Retention Policy · Local Aggregate Report
                </span>
                <h2
                  id="retis-pdf-report-title"
                  className="font-cormorant text-3xl font-bold mt-1"
                >
                  Monthly Screen Habits Report (PDF)
                </h2>
                <p className="font-dm text-xs opacity-80 mt-0.5">
                  Retained Date Range: {snapshot.dateRangeStart} – {snapshot.dateRangeEnd} · Observed:{' '}
                  {snapshot.observedDurationWithCoverage}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!snapshot.hasAnyObservations || isGeneratingPdf}
                  onClick={() => handleDownloadMonthlyPdf(false)}
                  className="btn-pill-primary py-2.5 px-5 text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isGeneratingPdf ? 'Generating PDF…' : 'Download PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  aria-label="Close Monthly Report modal"
                  className="btn-pill-secondary p-2.5 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {lastDownloadedFilename && (
              <div className="tactile-inner p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs font-dm">
                <span className="font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Downloaded {lastDownloadedFilename}</span>
                </span>
                <span className="opacity-75">PDF 1.4 generated locally</span>
              </div>
            )}

            {pdfError && (
              <div className="tactile-inner p-3.5 rounded-2xl flex items-center gap-2 text-xs font-dm text-amber-500 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{pdfError}</span>
              </div>
            )}

            <div className="tactile-inner p-5 sm:p-6 rounded-2xl flex flex-col gap-5">
              <div>
                <h3 className="font-dm text-xs font-bold uppercase tracking-wider opacity-80 mb-3">
                  1. Verified Aggregates ({snapshot.reportingPeriodLabel})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl border border-current/10">
                    <span className="text-[10px] font-dm uppercase font-bold opacity-75 block">
                      Avg. Blink Rate
                    </span>
                    <span className="font-dm text-xl font-bold tabular-nums mt-0.5 block">
                      {snapshot.metricEntries.blink_rate_bpm.formattedValue}
                    </span>
                    <span className="text-[11px] opacity-75 block mt-0.5">
                      Basis: {snapshot.observedDurationFormatted}
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-current/10">
                    <span className="text-[10px] font-dm uppercase font-bold opacity-75 block">
                      Validated Blinks
                    </span>
                    <span className="font-dm text-xl font-bold tabular-nums mt-0.5 block">
                      {snapshot.metricEntries.total_validated_blinks.formattedValue}
                    </span>
                    <span className="text-[11px] opacity-75 block mt-0.5">
                      Coverage: {snapshot.llmPayload.trackingCoveragePct}%
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-current/10">
                    <span className="text-[10px] font-dm uppercase font-bold opacity-75 block">
                      Screen Distance
                    </span>
                    <span className="font-dm text-xl font-bold tabular-nums mt-0.5 block">
                      {snapshot.metricEntries.screen_distance_cm.formattedValue}
                    </span>
                    <span className="text-[11px] opacity-75 block mt-0.5">
                      {snapshot.distanceStatus} (Optimal 38–65 cm)
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-current/10">
                    <span className="text-[10px] font-dm uppercase font-bold opacity-75 block">
                      Alerts &amp; Warnings
                    </span>
                    <span className="font-dm text-sm font-bold tabular-nums mt-1 block">
                      Blink Alerts: {telemetry.blinkAlerts}
                    </span>
                    <span className="font-dm text-sm font-bold tabular-nums block">
                      Distance Warn:{' '}
                      {telemetry.isCalibrated ? telemetry.distanceAlerts : 'Uncalibrated'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-current/10">
                <h3 className="font-dm text-xs font-bold uppercase tracking-wider opacity-80 mb-2">
                  2. Stated Data Gaps &amp; Retention Bounds
                </h3>
                <ul className="space-y-1 text-xs font-dm opacity-90 list-disc pl-5">
                  {snapshot.dataGaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </div>

              <div className="pt-4 border-t border-current/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-dm text-xs font-bold uppercase tracking-wider opacity-80">
                      3. Narrative Section
                    </h3>
                    <span className="glass-badge text-[10px]">AI-generated summary</span>
                  </div>
                  <button
                    type="button"
                    disabled={isGeneratingNarrative || !snapshot.hasAnyObservations}
                    onClick={handleRequestPdfAiNarrative}
                    className="btn-pill-secondary py-1 px-3 text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingNarrative
                      ? 'Generating AI summary…'
                      : pdfAiNarrative
                      ? 'Refresh AI summary'
                      : 'Include AI-generated summary'}
                  </button>
                </div>
                <p className="font-dm text-xs leading-relaxed opacity-90">
                  {pdfAiNarrative ||
                    `Local summary (${snapshot.reportingPeriodLabel}): Avg. blink rate is ${snapshot.metricEntries.blink_rate_bpm.formattedValue} over ${snapshot.observedDurationFormatted} observed (${snapshot.llmPayload.trackingCoveragePct}% coverage). Screen distance is ${snapshot.metricEntries.screen_distance_cm.formattedValue} (${snapshot.distanceStatus}). Blink alerts: ${telemetry.blinkAlerts}; Distance warnings: ${
                      telemetry.isCalibrated ? telemetry.distanceAlerts : 'Uncalibrated'
                    }; Longest session: ${telemetry.longestSessionHours} hrs.`}
                </p>
              </div>

              <div className="pt-3 border-t border-current/10 text-[11px] font-dm opacity-75">
                Wellness Disclaimer: IRIS provides screen-awareness suggestions based on local measurements and does not diagnose, treat, cure, or prevent any medical condition.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL 2: EYE-COMFORT HEAT MAP (Day x Hour-of-Day Grid)             */}
      {/* ================================================================== */}
      {activeModal === 'heatmap' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retis-heatmap-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="glass-modal w-full max-w-5xl rounded-[32px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-current/15">
              <div>
                <h2 id="retis-heatmap-title" className="font-cormorant text-3xl font-bold">
                  Heat Map
                </h2>
                <p className="font-dm text-xs opacity-85 mt-1">
                  {heatmapMetric === 'low_blink'
                    ? 'Low-blink intervals (<10 BPM) by day and hour.'
                    : 'Distance warnings (<40 cm) by day and hour.'}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="tactile-inner p-1 rounded-full inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHeatmapMetric('low_blink')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-dm font-bold cursor-pointer ${
                      heatmapMetric === 'low_blink'
                        ? isMinimal
                          ? isDark
                            ? 'bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D]'
                            : 'bg-[#111827] text-white'
                          : 'bg-[#FFD84D] text-black border border-black'
                        : 'opacity-75'
                    }`}
                  >
                    Low-Blink Windows (&lt;10 BPM)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeatmapMetric('distance_warnings')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-dm font-bold cursor-pointer ${
                      heatmapMetric === 'distance_warnings'
                        ? isMinimal
                          ? isDark
                            ? 'bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D]'
                            : 'bg-[#111827] text-white'
                          : 'bg-[#FFD84D] text-black border border-black'
                        : 'opacity-75'
                    }`}
                  >
                    Distance Warnings (&lt;40 cm)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  aria-label="Close heat map"
                  className="btn-pill-secondary p-2.5 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs font-dm">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-3 font-bold uppercase text-[11px] opacity-80">
                      Day
                    </th>
                    {snapshot.heatmapHours.map((hr) => (
                      <th
                        key={hr}
                        className="text-center py-2 px-1.5 font-bold tabular-nums text-[11px] opacity-80"
                      >
                        {hr === 12 ? '12p' : hr > 12 ? `${hr - 12}p` : `${hr}a`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.heatmapDays.map((dayRow) => (
                    <tr key={dayRow.dateStr} className="border-t border-current/10">
                      <td className="py-2.5 px-3 font-bold whitespace-nowrap">
                        {dayRow.dayLabel}
                      </td>
                      {dayRow.cells.map((cell) => {
                        const count =
                          heatmapMetric === 'low_blink'
                            ? cell.lowBlinkWindows
                            : cell.distanceWarnings;

                        if (!cell.hasData) {
                          return (
                            <td key={cell.hour} className="p-1">
                              <div
                                title={`${cell.dayLabel} ${cell.hourLabel}: No data recorded`}
                                className="h-10 rounded-lg border border-dashed border-current/25 flex items-center justify-center text-[10px] opacity-55 select-none"
                              >
                                --
                              </div>
                            </td>
                          );
                        }

                        const cellColorStyle =
                          count === 0
                            ? isMinimal
                              ? isDark
                                ? 'bg-emerald-500/20 border border-emerald-400/40 text-[#F5EDE4]'
                                : 'bg-emerald-100 border border-emerald-300 text-[#0F172A]'
                              : 'bg-[#25D6C1] border-2 border-black text-black font-extrabold'
                            : count <= 2
                            ? isMinimal
                              ? isDark
                                ? 'bg-amber-500/30 border border-amber-400/50 text-[#F5EDE4]'
                                : 'bg-amber-100 border border-amber-300 text-[#0F172A]'
                              : 'bg-[#FFD84D] border-2 border-black text-black font-extrabold'
                            : isMinimal
                            ? isDark
                              ? 'bg-orange-500/45 border border-orange-400/60 text-white'
                              : 'bg-orange-200 border border-orange-400 text-[#0F172A]'
                            : 'bg-[#FF851B] border-2 border-black text-black font-extrabold';

                        return (
                          <td key={cell.hour} className="p-1">
                            <div
                              title={`${cell.dayLabel} ${cell.hourLabel}: ${count} ${
                                heatmapMetric === 'low_blink'
                                  ? 'low-blink windows (<10 BPM)'
                                  : 'distance warnings (<40 cm)'
                              } | Avg BPM: ${cell.avgBlinkRate ?? '--'} (${
                                cell.monitoredMinutes
                              }m observed)`}
                              className={`h-10 rounded-lg flex flex-col items-center justify-center tabular-nums font-bold ${cellColorStyle}`}
                            >
                              <span>{count}</span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-current/15 text-xs font-dm">
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-bold uppercase text-[11px] opacity-80">
                  Legend (
                  {heatmapMetric === 'low_blink'
                    ? 'Unit: low-blink windows <10 BPM / hour'
                    : 'Unit: proximity warnings <40 cm / hour'}
                  ):
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded border border-dashed border-current/40 inline-flex items-center justify-center text-[9px]">
                    --
                  </span>
                  <span>No data (unobserved hour)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-emerald-400/60 border border-current/30 inline-block" />
                  <span>0 (Observed, 0 events)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-amber-400/80 border border-current/30 inline-block" />
                  <span>1–2 events</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-orange-500/80 border border-current/30 inline-block" />
                  <span>3+ events</span>
                </span>
              </div>
              <span className="text-[11px] opacity-75">
                30-day retention window · Local measurements only
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* MODAL 3: TRENDS CHART (Daily Avg BPM, Distance Warnings, Total Blinks) */}
      {/* ================================================================== */}
      {activeModal === 'trends' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="retis-trends-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="glass-modal w-full max-w-4xl rounded-[32px] p-6 sm:p-8 max-h-[90vh] overflow-y-auto flex flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-current/15">
              <div>
                <h2 id="retis-trends-title" className="font-cormorant text-3xl font-bold">
                  Trends
                </h2>
                <p className="font-dm text-xs opacity-85 mt-1">
                  Daily averages and alerts. Days without data are shown as gaps.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="tactile-inner p-1 rounded-full inline-flex items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'All Series' },
                      { id: 'blink_rate', label: 'Avg. BPM' },
                      { id: 'distance_warnings', label: 'Distance Warnings' },
                      { id: 'total_blinks', label: 'Total Blinks' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTrendsMetricFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-dm font-bold cursor-pointer ${
                        trendsMetricFilter === tab.id
                          ? isMinimal
                            ? isDark
                              ? 'bg-[var(--theme-accent,#FF7A1A)] text-[#0D0D0D]'
                              : 'bg-[#111827] text-white'
                            : 'bg-[#FFD84D] text-black border border-black'
                          : 'opacity-75'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModal('none')}
                  aria-label="Close Trends chart modal"
                  className="btn-pill-secondary p-2.5 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {snapshot.trackedDaysCount < 2 ? (
              <div className="tactile-inner rounded-2xl p-8 text-center flex flex-col items-center gap-3">
                <TrendingUp className="w-8 h-8" style={{ color: safeAccentTextHex }} />
                <h3 className="font-dm text-base font-bold">
                  Not enough tracked days for a multi-day trend line ({snapshot.trackedDaysCount} of 2 minimum days tracked)
                </h3>
                <p className="font-dm text-xs opacity-80 max-w-lg leading-relaxed">
                  A minimum of 2 tracked days is required to plot day-over-day trends honestly without fabricating points. Untracked days are preserved as gaps rather than zeros.
                </p>
                {snapshot.hasAnyObservations && (
                  <div className="grid grid-cols-3 gap-3 mt-3 w-full max-w-md text-xs font-dm">
                    <div className="p-3 rounded-xl border border-current/15">
                      <span className="block text-[10px] uppercase font-bold opacity-75">
                        Today BPM
                      </span>
                      <span
                        className="font-bold text-base tabular-nums"
                        style={{ color: safeAccentTextHex }}
                      >
                        {snapshot.metricEntries.blink_rate_bpm.formattedValue}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-current/15">
                      <span className="block text-[10px] uppercase font-bold opacity-75">
                        Warnings
                      </span>
                      <span
                        className="font-bold text-base tabular-nums"
                        style={{ color: safeAccentTextHex }}
                      >
                        {telemetry.isCalibrated ? telemetry.distanceAlerts : '--'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-current/15">
                      <span className="block text-[10px] uppercase font-bold opacity-75">
                        Validated Blinks
                      </span>
                      <span
                        className="font-bold text-base tabular-nums"
                        style={{ color: safeAccentTextHex }}
                      >
                        {telemetry.totalBlinksDetected}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-72 p-4 rounded-2xl tactile-inner">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={snapshot.trendSeries}
                    margin={{ top: 12, right: 20, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartGridColor}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      stroke={chartAxisColor}
                      tick={{ fontSize: 11, fill: chartAxisColor, fontWeight: 600 }}
                    />
                    <YAxis
                      stroke={chartAxisColor}
                      tick={{ fontSize: 11, fill: chartAxisColor, fontWeight: 600 }}
                    />
                    <Tooltip />
                    <Legend verticalAlign="top" height={32} />
                    {(trendsMetricFilter === 'all' || trendsMetricFilter === 'blink_rate') && (
                      <Line
                        name="Daily Avg. Blink Rate (BPM)"
                        type="monotone"
                        dataKey="blinkRate"
                        stroke={rawAccentHex}
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{ r: 4, fill: rawAccentHex }}
                      />
                    )}
                    {(trendsMetricFilter === 'all' ||
                      trendsMetricFilter === 'distance_warnings') && (
                      <Line
                        name="Distance Warnings"
                        type="monotone"
                        dataKey="distanceWarnings"
                        stroke="#FF851B"
                        strokeWidth={2.5}
                        connectNulls={false}
                        dot={{ r: 4, fill: '#FF851B' }}
                      />
                    )}
                    {(trendsMetricFilter === 'all' || trendsMetricFilter === 'total_blinks') && (
                      <Line
                        name="Total Validated Blinks"
                        type="monotone"
                        dataKey="totalValidatedBlinks"
                        stroke="#25D6C1"
                        strokeWidth={2.5}
                        connectNulls={false}
                        dot={{ r: 4, fill: '#25D6C1' }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid grid-cols-7 gap-2 pt-2">
              {snapshot.trendSeries.map((pt) => (
                <div
                  key={pt.date}
                  className={`p-2.5 rounded-xl text-center text-xs font-dm ${
                    pt.hasData
                      ? 'tactile-inner'
                      : 'border border-dashed border-current/25 opacity-60'
                  }`}
                >
                  <span className="block text-[10px] font-bold uppercase">{pt.day}</span>
                  <span className="block text-[10px] opacity-75">{pt.formattedDate}</span>
                  <span className="block font-bold tabular-nums mt-1">
                    {pt.hasData ? `${pt.blinkRate ?? '--'} BPM` : 'Gap'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
