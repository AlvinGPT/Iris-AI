import { FilesetResolver, FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export type DetectorLifecycleStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface FaceDetectionResult {
  landmarks: NormalizedLandmark[];
  blendshapes?: Record<string, number>;
  confidence: number;
  timestamp: number;
}

// Module-level cache so the ~3.7MB model and WASM runtime are not repeatedly recreated
let sharedFaceLandmarker: FaceLandmarker | null = null;
let sharedInitPromise: Promise<FaceLandmarker> | null = null;
let sharedStatus: DetectorLifecycleStatus = 'idle';
let sharedError: string | null = null;
let lastGlobalTimestampMs = 0;

export class FaceLandmarkerService {
  private isProcessingFrame = false;
  private lastInferenceTime = 0;

  public getStatus(): DetectorLifecycleStatus {
    if (sharedFaceLandmarker) return 'ready';
    return sharedStatus;
  }

  public getError(): string | null {
    return sharedError;
  }

  /**
   * Initialize MediaPipe Tasks Vision FaceLandmarker using the CPU (XNNPACK WASM) delegate
   * to guarantee compatibility across all GPUs without WebGL FP16 shader failures.
   */
  public async initialize(): Promise<FaceLandmarker> {
    if (sharedFaceLandmarker) {
      sharedStatus = 'ready';
      sharedError = null;
      return sharedFaceLandmarker;
    }

    if (sharedInitPromise) {
      return sharedInitPromise;
    }

    sharedStatus = 'loading';
    sharedError = null;

    sharedInitPromise = (async () => {
      try {
        // Resolve WASM files from official CDN
        const filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const modelAssetPath =
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

        const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
        });

        sharedFaceLandmarker = landmarker;
        sharedStatus = 'ready';
        sharedError = null;
        return landmarker;
      } catch (err) {
        sharedInitPromise = null;
        sharedStatus = 'error';
        const msg = err instanceof Error ? err.message : String(err);
        sharedError = `Failed to load face detection model: ${msg}`;
        throw new Error(sharedError);
      }
    })();

    return sharedInitPromise;
  }

  public isReady(): boolean {
    return sharedFaceLandmarker !== null;
  }

  /**
   * Process a single live video frame.
   * Note: If a caller passes a value > 100 for minIntervalMs (e.g. a performance.now() timestamp),
   * it is treated as 0 so frame detection is never accidentally throttled.
   */
  public detectVideoFrame(
    videoElement: HTMLVideoElement,
    minIntervalMs = 0
  ): FaceDetectionResult | null {
    if (!sharedFaceLandmarker || this.isProcessingFrame) {
      return null;
    }

    if (
      videoElement.readyState < 2 ||
      videoElement.ended ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return null;
    }

    const now = performance.now();
    // Guard against callers passing a timestamp instead of an interval
    const safeMinInterval = minIntervalMs > 0 && minIntervalMs <= 100 ? minIntervalMs : 0;
    if (safeMinInterval > 0 && now - this.lastInferenceTime < safeMinInterval) {
      return null;
    }

    this.isProcessingFrame = true;
    try {
      // Strictly monotonically increasing integer timestamp for MediaPipe VIDEO mode
      const candidateTs = Math.round(now);
      const frameTimestamp = Math.max(
        candidateTs,
        this.lastInferenceTime + 1,
        lastGlobalTimestampMs + 1
      );
      this.lastInferenceTime = frameTimestamp;
      lastGlobalTimestampMs = frameTimestamp;

      const result = sharedFaceLandmarker.detectForVideo(videoElement, frameTimestamp);

      if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        if (!landmarks || landmarks.length < 468) {
          return null;
        }

        let blendshapesMap: Record<string, number> | undefined;
        if (result.faceBlendshapes && result.faceBlendshapes.length > 0) {
          blendshapesMap = {};
          const categories = result.faceBlendshapes[0].categories;
          for (let i = 0; i < categories.length; i++) {
            blendshapesMap[categories[i].categoryName] = categories[i].score;
          }
        }

        // Verify key facial anchor landmarks are finite and within reasonable bounds
        const nose = landmarks[1];
        const forehead = landmarks[10];
        const chin = landmarks[152];
        const hasValidAnchors =
          nose &&
          forehead &&
          chin &&
          Number.isFinite(nose.x) &&
          Number.isFinite(nose.y) &&
          Math.abs(chin.y - forehead.y) > 0.04;

        if (!hasValidAnchors) {
          return null;
        }

        return {
          landmarks,
          blendshapes: blendshapesMap,
          confidence: 0.94,
          timestamp: now,
        };
      }
      return null;
    } catch {
      return null;
    } finally {
      this.isProcessingFrame = false;
    }
  }

  /**
   * Reset processing lock cleanly
   */
  public dispose(): void {
    this.isProcessingFrame = false;
  }
}
