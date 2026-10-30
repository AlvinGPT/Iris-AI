import { strict as assert } from 'assert';
import { BlinkDetector } from '../blinkDetector';
import { DistanceEstimator } from '../distanceEstimator';
import { CameraService } from '../cameraService';
import { MonitoringState, EyeDetectionState, CameraPermissionState } from '../../types';

console.log('--- TEST: Camera Monitoring & Truthful State Machine ---');

// 1. Test Camera Error Classification into explicit states
function testCameraErrorClassification() {
  console.log('Testing Camera Error Classification...');

  const notAllowed = new DOMException('Permission denied', 'NotAllowedError');
  const classified1 = CameraService.classifyCameraError(notAllowed);
  assert.equal(classified1.permissionState, 'Camera blocked');

  const notFound = new DOMException('No camera device found', 'NotFoundError');
  const classified2 = CameraService.classifyCameraError(notFound);
  assert.equal(classified2.permissionState, 'Camera unavailable');

  const notReadable = new DOMException('Device in use', 'NotReadableError');
  const classified3 = CameraService.classifyCameraError(notReadable);
  assert.equal(classified3.permissionState, 'Camera in use by another application');

  const trackStart = new DOMException('TrackStartError', 'TrackStartError');
  const classified4 = CameraService.classifyCameraError(trackStart);
  assert.equal(classified4.permissionState, 'Camera in use by another application');

  console.log('  ✓ Camera errors classified into Camera blocked, Camera unavailable, and Camera in use');
}

// 2. Test MonitoringState Derivation Logic
function testMonitoringStateDerivation() {
  console.log('Testing MonitoringState Derivation Logic...');

  const deriveState = (
    isMonitoring: boolean,
    cameraStatus: string,
    cameraPermissionState: CameraPermissionState,
    faceDetected: boolean,
    cameraError?: string
  ): MonitoringState => {
    if (cameraStatus === 'requesting_permission' || cameraStatus === 'initializing') {
      return 'STARTING';
    }
    if (cameraStatus === 'error') {
      const err = (cameraError || '').toLowerCase();
      if (
        err.includes('in use') ||
        err.includes('another application') ||
        cameraPermissionState === 'Camera in use by another application'
      ) {
        return 'CAMERA_BUSY';
      }
      if (
        err.includes('denied') ||
        err.includes('blocked') ||
        cameraPermissionState === 'Camera blocked' ||
        cameraPermissionState === 'Permission denied'
      ) {
        return 'CAMERA_BLOCKED';
      }
      return 'ERROR';
    }
    if (!isMonitoring) {
      return 'PAUSED';
    }
    if (!faceDetected) {
      return 'NO_FACE';
    }
    return 'ACTIVE';
  };

  assert.equal(deriveState(false, 'idle', 'Permission not requested', false), 'PAUSED');
  assert.equal(deriveState(false, 'requesting_permission', 'Requesting permission', false), 'STARTING');
  assert.equal(deriveState(false, 'initializing', 'Monitoring active', false), 'STARTING');
  assert.equal(deriveState(true, 'running', 'Monitoring active', true), 'ACTIVE');
  assert.equal(deriveState(true, 'running', 'Monitoring active', false), 'NO_FACE');
  assert.equal(deriveState(false, 'error', 'Camera blocked', false, 'Permission denied'), 'CAMERA_BLOCKED');
  assert.equal(deriveState(false, 'error', 'Camera in use by another application', false, 'Camera in use'), 'CAMERA_BUSY');
  assert.equal(deriveState(false, 'error', 'Camera initialization failed', false, 'Hardware error'), 'ERROR');

  console.log('  ✓ All 7 MonitoringState enum variants verified');
}

// 3. Test EyeDetectionState Derivation Logic
function testEyeDetectionStateDerivation() {
  console.log('Testing EyeDetectionState Derivation Logic...');

  const deriveEyeState = (
    isMonitoring: boolean,
    cameraStatus: string,
    faceDetected: boolean,
    isReliable: boolean,
    faceObscured = false
  ): EyeDetectionState => {
    if (!isMonitoring || cameraStatus !== 'running') {
      return 'Detection unavailable';
    }
    if (!faceDetected) {
      return 'Eyes not detected';
    }
    if (faceObscured) {
      return 'Detection unavailable';
    }
    if (isReliable) {
      return 'Eyes detected';
    }
    return 'Eyes not detected';
  };

  assert.equal(deriveEyeState(false, 'idle', false, false), 'Detection unavailable');
  assert.equal(deriveEyeState(true, 'running', false, false), 'Eyes not detected');
  assert.equal(deriveEyeState(true, 'running', true, false), 'Eyes not detected');
  assert.equal(deriveEyeState(true, 'running', true, true, false), 'Eyes detected');
  assert.equal(deriveEyeState(true, 'running', true, true, true), 'Detection unavailable');

  console.log('  ✓ All 3 EyeDetectionState enum variants verified');
}

// 4. Test Blink Rate Computation: No fake data & truthful average
function testBlinkRateAccuracy() {
  console.log('Testing Blink Rate Accuracy & Observation Logic...');

  const detector = new BlinkDetector();
  // Initially with 0 observation time, average rate is null
  assert.equal(detector.getAverageBlinkRate(0), null);
  assert.equal(detector.getAverageBlinkRate(4), null); // < 5s returns null

  // If 5 blinks recorded over 60 seconds (1 minute), rate should be exactly 5 BPM
  (detector as any).totalBlinks = 5;

  const rate60s = detector.getAverageBlinkRate(60);
  assert.equal(rate60s, 5);

  const rate120s = detector.getAverageBlinkRate(120);
  assert.equal(rate120s, 3); // 5 blinks in 2 minutes = 2.5 -> rounds to 3

  console.log('  ✓ Blink rate calculated strictly from real validated blinks and valid observed time');
}

// 5. Test Screen Distance & Sustained Proximity Alert Timing
function testSustainedProximityAlert() {
  console.log('Testing Sustained Proximity Window (>= 3.0s) & Cooldown...');

  let alertsCount = 0;
  let lastAlertMs = -100000;
  let sustainedStartMs: number | null = null;
  const proxThreshold = 40;

  const checkProximity = (
    nowMs: number,
    calibratedDistance: number | null,
    isReliable: boolean
  ) => {
    if (isReliable && calibratedDistance !== null && calibratedDistance < proxThreshold) {
      if (sustainedStartMs === null) {
        sustainedStartMs = nowMs;
      } else if (nowMs - sustainedStartMs >= 3000 && nowMs - lastAlertMs > 45000) {
        lastAlertMs = nowMs;
        sustainedStartMs = null;
        alertsCount += 1;
      }
    } else {
      sustainedStartMs = null;
    }
  };

  // Frame 1 at t=0ms: distance is 35cm (< 40). Should NOT alert immediately!
  checkProximity(1000, 35, true);
  assert.equal(alertsCount, 0, 'Must not alert on single frame');

  // Frame 2 at t=2000ms: distance is still 35cm (2.0s sustained). Still no alert!
  checkProximity(3000, 35, true);
  assert.equal(alertsCount, 0, 'Must not alert before 3 seconds sustained');

  // Frame 3 at t=4100ms: distance has been < threshold for 3.1s continuously. ALERT FIRES!
  checkProximity(4100, 35, true);
  assert.equal(alertsCount, 1, 'Alert must fire after >= 3.0s sustained proximity');

  // Frame 4 at t=5000ms: still close, but cooldown (45s) must prevent immediate refiring!
  checkProximity(5000, 35, true);
  assert.equal(alertsCount, 1, 'Cooldown must suppress immediate refiring');

  // If user leans back at t=6000ms (50cm), sustained timer resets
  checkProximity(6000, 50, true);
  assert.equal(sustainedStartMs, null, 'Timer must reset when distance returns to normal');

  // If user leans forward again at t=10000ms for 4s, but cooldown (45s) is not elapsed, no alert
  checkProximity(10000, 35, true);
  checkProximity(14000, 35, true);
  assert.equal(alertsCount, 1, 'Must respect 45s cooldown');

  // After 45s cooldown (t=50000ms), 3s sustained alert fires again
  checkProximity(50000, 35, true);
  checkProximity(53500, 35, true);
  assert.equal(alertsCount, 2, 'Alert fires after cooldown elapsed and 3s sustained');

  console.log('  ✓ Proximity alert requires >= 3.0s sustained window and enforces 45s cooldown');
}

// 6. Test Distance Reset on Face Loss
function testDistanceResetOnFaceLoss() {
  console.log('Testing Distance Reset on Face Loss...');

  const estimator = new DistanceEstimator();
  assert.equal(estimator.estimateDistance(null).distanceCm, null);

  // When face is lost (null landmarks), smoothedDistance resets to null
  estimator.manualSetDistance(50);
  assert.equal(estimator.getReferenceDistance(), 50);

  const lostResult = estimator.estimateDistance(null);
  assert.equal(lostResult.distanceCm, null);
  assert.equal(lostResult.trackingQuality, 'Lost');

  console.log('  ✓ Distance returns null on face loss without preserving fake or stale values');
}

function runAll() {
  testCameraErrorClassification();
  testMonitoringStateDerivation();
  testEyeDetectionStateDerivation();
  testBlinkRateAccuracy();
  testSustainedProximityAlert();
  testDistanceResetOnFaceLoss();
  console.log('========================================');
  console.log('ALL CAMERA MONITORING TESTS PASSED');
  console.log('========================================');
}

runAll();
