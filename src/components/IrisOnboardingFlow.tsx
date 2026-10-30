import React from 'react';
import { OnboardingStep } from '../types';
import { PersistedCalibrationMetadata } from '../services/onboardingVisionService';
import { OnboardingFlow } from './onboarding/OnboardingFlow';

export { OnboardingFlow } from './onboarding/OnboardingFlow';
export { OnboardingProgress } from './onboarding/OnboardingProgress';
export { WelcomeStep } from './onboarding/WelcomeStep';
export { PrivacyPolicyStep } from './onboarding/PrivacyPolicyStep';
export { CameraPermissionStep } from './onboarding/CameraPermissionStep';
export { CameraPositionStep } from './onboarding/CameraPositionStep';
export { FaceAlignmentOverlay } from './onboarding/FaceAlignmentOverlay';
export { EyeAlignmentStep } from './onboarding/EyeAlignmentStep';
export { CalibrationStep } from './onboarding/CalibrationStep';
export { SetupCompleteStep } from './onboarding/SetupCompleteStep';

export interface IrisOnboardingFlowProps {
  initialStep?: OnboardingStep;
  recoveryReason?: string;
  onComplete: (metadata: PersistedCalibrationMetadata | null) => void;
}

export const IrisOnboardingFlow: React.FC<IrisOnboardingFlowProps> = ({
  initialStep = 'welcome',
  recoveryReason,
  onComplete,
}) => {
  return (
    <OnboardingFlow
      initialStep={initialStep}
      recoveryReason={recoveryReason}
      onComplete={onComplete}
    />
  );
};
