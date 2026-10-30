import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CalibrationData } from '../types';

const STORAGE_KEY = 'iris_vision_calibration_v1';

export interface DistanceEstimationResult {
  distanceCm: number | null;
  rawWidth: number;
  isCalibrated: boolean;
  trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost';
  headPose: {
    yaw: number; // Left/Right rotation in degrees
    pitch: number; // Up/Down tilt in degrees
    roll: number; // Lateral head tilt in degrees
  };
}

export class DistanceEstimator {
  private calibration: CalibrationData | null = null;
  private smoothedDistance: number | null = null;

  constructor() {
    this.loadCalibration();
  }

  public loadCalibration(): CalibrationData | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CalibrationData;
        if (parsed.baselineFaceWidth > 0 && parsed.referenceDistanceCm > 0) {
          this.calibration = parsed;
          return parsed;
        }
      }

      // Fallback: check onboarding setup storage v3
      const onboardingStored = localStorage.getItem('iris_onboarding_setup_v3');
      if (onboardingStored) {
        const parsedRecord = JSON.parse(onboardingStored);
        if (
          parsedRecord?.calibrationSaved &&
          parsedRecord?.calibrationMetadata?.normalizedFaceWidth > 0
        ) {
          const meta = parsedRecord.calibrationMetadata;
          const calibData: CalibrationData = {
            baselineEAR: meta.baselineEAR || 0.28,
            baselineFaceWidth: meta.normalizedFaceWidth,
            referenceDistanceCm: 48,
            calibratedAt: meta.timestamp || Date.now(),
            calibrationValid: true,
          };
          this.calibration = calibData;
          return calibData;
        }
      }
    } catch {
      // LocalStorage error fallback
    }

    // Default sensible laptop baseline (~42 cm at 0.32 normalized face width)
    this.calibration = {
      baselineEAR: 0.28,
      baselineFaceWidth: 0.32,
      referenceDistanceCm: 42,
      calibratedAt: 0,
    };
    return this.calibration;
  }

  public saveCalibration(
    baselineEAR: number,
    baselineFaceWidth: number,
    referenceDistanceCm = 42
  ): void {
    const data: CalibrationData = {
      baselineEAR: Number(baselineEAR.toFixed(3)),
      baselineFaceWidth: Number(baselineFaceWidth.toFixed(4)),
      referenceDistanceCm,
      calibratedAt: Date.now(),
    };
    this.calibration = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable
    }
  }

  public isUserCalibrated(): boolean {
    return !!(this.calibration && this.calibration.calibratedAt > 0);
  }

  public getCalibration(): CalibrationData | null {
    return this.calibration;
  }

  public getReferenceDistance(): number {
    return this.calibration?.referenceDistanceCm ?? 42;
  }

  public manualSetDistance(referenceDistanceCm: number): void {
    const existingWidth = this.calibration?.baselineFaceWidth || 0.32;
    const existingEAR = this.calibration?.baselineEAR || 0.28;
    this.saveCalibration(existingEAR, existingWidth, referenceDistanceCm);
    this.smoothedDistance = referenceDistanceCm;
  }

  public clearCalibration(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable
    }
    this.calibration = {
      baselineEAR: 0.28,
      baselineFaceWidth: 0.32,
      referenceDistanceCm: 42,
      calibratedAt: 0,
    };
    this.smoothedDistance = null;
  }

  /**
   * Calculate apparent face width and head pose to estimate distance
   */
  public estimateDistance(
    landmarks: NormalizedLandmark[] | null
  ): DistanceEstimationResult {
    if (!landmarks || landmarks.length < 468) {
      this.smoothedDistance = null;
      return {
        distanceCm: null,
        rawWidth: 0,
        isCalibrated: this.isUserCalibrated(),
        trackingQuality: 'Lost',
        headPose: { yaw: 0, pitch: 0, roll: 0 },
      };
    }

    // Facial boundary landmarks:
    // 234: Left zygomatic arch / tragus
    // 454: Right zygomatic arch / tragus
    // 1: Nose tip
    // 10: Glabella / forehead
    // 152: Menton / chin
    // 33: Left eye outer corner
    // 263: Right eye outer corner
    const pLeftCheek = landmarks[234];
    const pRightCheek = landmarks[454];
    const pNose = landmarks[1];
    const pForehead = landmarks[10];
    const pChin = landmarks[152];
    const pLeftEye = landmarks[33];
    const pRightEye = landmarks[263];

    if (!pLeftCheek || !pRightCheek || !pNose || !pForehead || !pChin) {
      return {
        distanceCm: null,
        rawWidth: 0,
        isCalibrated: this.isUserCalibrated(),
        trackingQuality: 'Lost',
        headPose: { yaw: 0, pitch: 0, roll: 0 },
      };
    }

    // 1. Apparent face width in normalized coordinate space
    const dxFace = pRightCheek.x - pLeftCheek.x;
    const dyFace = pRightCheek.y - pLeftCheek.y;
    const faceWidth = Math.sqrt(dxFace * dxFace + dyFace * dyFace);

    // 2. Inter-ocular distance (fallback / verification)
    const dxEye = pRightEye.x - pLeftEye.x;
    const dyEye = pRightEye.y - pLeftEye.y;
    const eyeWidth = Math.sqrt(dxEye * dxEye + dyEye * dyEye);

    // 3. Head Pose estimation:
    // Roll (tilt side-to-side)
    const rollRad = Math.atan2(dyFace, dxFace);
    const rollDeg = Math.round((rollRad * 180) / Math.PI);

    // Yaw (turn left/right): compare distance from nose to each cheek
    const distLeftToNose = Math.abs(pNose.x - pLeftCheek.x);
    const distRightToNose = Math.abs(pRightCheek.x - pNose.x);
    const yawRatio =
      distRightToNose + distLeftToNose > 0.001
        ? (distRightToNose - distLeftToNose) / (distRightToNose + distLeftToNose)
        : 0;
    const yawDeg = Math.round(yawRatio * 75); // Approximation in degrees

    // Pitch (tilt up/down): compare forehead-to-nose vs nose-to-chin
    const distForeheadToNose = Math.abs(pNose.y - pForehead.y);
    const distNoseToChin = Math.abs(pChin.y - pNose.y);
    const pitchRatio =
      distForeheadToNose + distNoseToChin > 0.001
        ? (distForeheadToNose - distNoseToChin) / (distForeheadToNose + distNoseToChin)
        : 0;
    const pitchDeg = Math.round(pitchRatio * 60);

    const headPose = {
      yaw: yawDeg,
      pitch: pitchDeg,
      roll: rollDeg,
    };

    // Tracking quality assessment:
    let trackingQuality: 'High' | 'Moderate' | 'Low' | 'Lost' = 'High';
    if (Math.abs(yawDeg) > 28 || Math.abs(pitchDeg) > 25 || Math.abs(rollDeg) > 25) {
      trackingQuality = 'Low';
    } else if (Math.abs(yawDeg) > 16 || Math.abs(pitchDeg) > 15) {
      trackingQuality = 'Moderate';
    }

    if (faceWidth < 0.08 || faceWidth > 0.85) {
      trackingQuality = 'Low';
    }

    // 4. Distance Calculation using optical inverse proportion with yaw compensation:
    // D = D_ref * (W_ref / W_effective)
    const isCalibrated = this.isUserCalibrated();
    const refDistance = isCalibrated && this.calibration ? this.calibration.referenceDistanceCm : 48;
    const baselineWidth = isCalibrated && this.calibration ? this.calibration.baselineFaceWidth : 0.32;

    // Correct for minor yaw foreshortening: W_effective = W_observed / cos(yaw)
    const cosYaw = Math.max(0.72, Math.cos((yawDeg * Math.PI) / 180));
    const effectiveWidth = faceWidth / cosYaw;

    const rawDistance = refDistance * (baselineWidth / effectiveWidth);

    // Clamped sensible bounds for desktop usage (15 cm - 120 cm)
    const clampedDistance = Math.min(120, Math.max(15, rawDistance));

    // Smooth distance via Exponential Moving Average (EMA) to eliminate jitter
    if (this.smoothedDistance === null) {
      this.smoothedDistance = clampedDistance;
    } else {
      const alpha = 0.20; // 20% new, 80% previous for smooth responsiveness
      this.smoothedDistance = this.smoothedDistance * (1 - alpha) + clampedDistance * alpha;
    }

    return {
      distanceCm: Math.round(this.smoothedDistance),
      rawWidth: Number(faceWidth.toFixed(4)),
      isCalibrated,
      trackingQuality,
      headPose,
    };
  }

  public calibrateFromLandmarks(landmarks: NormalizedLandmark[], refDistance = 50): boolean {
    if (!landmarks || landmarks.length < 468) return false;
    const pLeftCheek = landmarks[234];
    const pRightCheek = landmarks[454];
    const pNose = landmarks[1];
    if (!pLeftCheek || !pRightCheek) return false;
    const dx = pRightCheek.x - pLeftCheek.x;
    const dy = pRightCheek.y - pLeftCheek.y;
    const faceWidth = Math.sqrt(dx * dx + dy * dy);
    if (faceWidth < 0.08 || faceWidth > 0.85) return false;

    let cosYaw = 1.0;
    if (pNose) {
      const distLeft = Math.abs(pNose.x - pLeftCheek.x);
      const distRight = Math.abs(pRightCheek.x - pNose.x);
      const yawRatio = distRight + distLeft > 0.001 ? (distRight - distLeft) / (distRight + distLeft) : 0;
      const yawDeg = Math.round(yawRatio * 75);
      cosYaw = Math.max(0.72, Math.cos((yawDeg * Math.PI) / 180));
    }
    const effectiveWidth = faceWidth / cosYaw;

    this.saveCalibration(0.28, effectiveWidth, refDistance);
    this.smoothedDistance = refDistance;
    return true;
  }

  public reset(): void {
    this.smoothedDistance = null;
  }
}
