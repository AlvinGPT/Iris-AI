import { BlinkDetector, DEFAULT_BLINK_CONFIG } from '../blinkDetector';

function runSensitivityTests() {
  console.log('--- Testing Blink Detection Sensitivity & Relative Baseline Adaptation ---');

  const detector = new BlinkDetector(0.28);

  // Helper to create artificial landmarks with eye open or closed
  const createLandmarks = (earValue: number) => {
    // 468 dummy landmarks
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })) as any;
    // LEFT_EYE indices:
    // cornerOuter: 33, cornerInner: 133
    // topCenter: 159, bottomCenter: 145
    // topOuter: 160, bottomOuter: 144
    // topInner: 158, bottomInner: 153
    landmarks[33] = { x: 0.3, y: 0.5, z: 0 };
    landmarks[133] = { x: 0.4, y: 0.5, z: 0 }; // dHoriz = 0.1
    // ear = (d1 + 2*d2 + d3) / (4 * dHoriz) = d / dHoriz
    // Let's set top and bottom centers to give exact earValue
    const d = earValue * 0.1;
    landmarks[159] = { x: 0.35, y: 0.5 - d / 2, z: 0 };
    landmarks[145] = { x: 0.35, y: 0.5 + d / 2, z: 0 };
    landmarks[160] = { x: 0.32, y: 0.5 - d / 2, z: 0 };
    landmarks[144] = { x: 0.32, y: 0.5 + d / 2, z: 0 };
    landmarks[158] = { x: 0.38, y: 0.5 - d / 2, z: 0 };
    landmarks[153] = { x: 0.38, y: 0.5 + d / 2, z: 0 };

    // RIGHT_EYE indices:
    // cornerOuter: 263, cornerInner: 362
    // topCenter: 386, bottomCenter: 374
    // topOuter: 387, bottomOuter: 373
    // topInner: 385, bottomInner: 380
    landmarks[263] = { x: 0.6, y: 0.5, z: 0 };
    landmarks[362] = { x: 0.7, y: 0.5, z: 0 }; // dHoriz = 0.1
    landmarks[386] = { x: 0.65, y: 0.5 - d / 2, z: 0 };
    landmarks[374] = { x: 0.65, y: 0.5 + d / 2, z: 0 };
    landmarks[387] = { x: 0.62, y: 0.5 - d / 2, z: 0 };
    landmarks[373] = { x: 0.62, y: 0.5 + d / 2, z: 0 };
    landmarks[385] = { x: 0.68, y: 0.5 - d / 2, z: 0 };
    landmarks[380] = { x: 0.68, y: 0.5 + d / 2, z: 0 };

    return landmarks;
  };

  const openEyes = createLandmarks(0.28);
  const closedEyes = createLandmarks(0.18); // > 22% drop (0.18 / 0.28 = ~35% drop)

  let t = 1000;
  // 1. Calibrate with open eye frames
  for (let i = 0; i < 15; i++) {
    detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 });
    t += 40;
  }

  const initialCount = detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }).totalBlinks;
  console.log(`Calibrated baseline. Initial blinks: ${initialCount}`);

  // Test 1: Condition B (Relative EAR Drop > 22% and reopening)
  t += 200;
  // Closed frame
  detector.processLandmarks(closedEyes, t, { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.1 });
  t += 40;
  // Reopen frame
  const resBlink1 = detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 });
  if (resBlink1.totalBlinks !== initialCount + 1) {
    throw new Error(`Expected totalBlinks ${initialCount + 1}, got ${resBlink1.totalBlinks}`);
  }
  console.log('✓ Condition B: Relative EAR drop > 22% successfully triggered and committed blink');

  // Test 2: Condition A (Neural blendshapes > 0.42 even with moderate EAR)
  t += 300; // past 180ms refractory period
  const moderateEyes = createLandmarks(0.24); // only slight geometric drop
  detector.processLandmarks(moderateEyes, t, { eyeBlinkLeft: 0.48, eyeBlinkRight: 0.49 });
  t += 40;
  const resBlink2 = detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 });
  if (resBlink2.totalBlinks !== initialCount + 2) {
    throw new Error(`Expected totalBlinks ${initialCount + 2}, got ${resBlink2.totalBlinks}`);
  }
  console.log('✓ Condition A: Neural blendshapes > 0.42 successfully triggered and committed blink');

  // Test 3: Challenge Mode Boost (neural blendshape >= 0.35 in challenge mode)
  t += 300;
  detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.36, eyeBlinkRight: 0.37 }, undefined, 0, true);
  t += 40;
  const resBlink3 = detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }, undefined, 0, true);
  if (resBlink3.totalBlinks !== initialCount + 3) {
    throw new Error(`Expected totalBlinks ${initialCount + 3}, got ${resBlink3.totalBlinks}`);
  }
  console.log('✓ Challenge Mode Boost: Neural blendshapes >= 0.35 committed blink in challenge mode');

  // Test 4: Refractory debounce protection (under 180ms rejects duplicate bounce)
  t += 50; // only 50ms after last blink (< 180ms)
  detector.processLandmarks(closedEyes, t, { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.8 });
  t += 40;
  const resDuplicate = detector.processLandmarks(openEyes, t, { eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 });
  if (resDuplicate.totalBlinks !== initialCount + 3) {
    throw new Error(`Expected bounce blink to be rejected by 180ms debounce, got ${resDuplicate.totalBlinks}`);
  }
  console.log('✓ Debounce: 180ms refractory period prevents false double-counts from eyelid bounce');

  console.log('ALL SENSITIVITY TESTS PASSED!');
}

runSensitivityTests();
