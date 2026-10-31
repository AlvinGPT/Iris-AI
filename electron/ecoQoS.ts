import os from 'os';

export interface EcoQoSResult {
  tier: 1 | 2 | 3;
  mode: 'win32-ecoqos' | 'win-priority-fallback' | 'wine-nice-fallback';
  success: boolean;
  details: string;
}

// Windows Process Priority Classes
const BELOW_NORMAL_PRIORITY_CLASS = 0x00004000;
const NORMAL_PRIORITY_CLASS = 0x00000020;

// Windows Process Power Throttling Constants (Win10 1709+ / Win11)
const ProcessPowerThrottling = 4;
const PROCESS_POWER_THROTTLING_CURRENT_VERSION = 1;
const PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1;

let koffiLoaded = false;
let kernel32Lib: any = null;
let fnGetCurrentProcess: any = null;
let fnSetPriorityClass: any = null;
let fnSetProcessInformation: any = null;
let ProcessPowerThrottlingStateStruct: any = null;

function initKoffiWin32(): boolean {
  if (koffiLoaded) return Boolean(kernel32Lib);
  koffiLoaded = true;

  if (process.platform !== 'win32') {
    return false;
  }

  try {
    const koffi = require('koffi');
    kernel32Lib = koffi.load('kernel32.dll');

    ProcessPowerThrottlingStateStruct = koffi.struct('PROCESS_POWER_THROTTLING_STATE', {
      Version: 'uint32',
      ControlMask: 'uint32',
      StateMask: 'uint32',
    });

    fnGetCurrentProcess = kernel32Lib.func('void* GetCurrentProcess()');
    fnSetPriorityClass = kernel32Lib.func('int SetPriorityClass(void*, uint32)');
    fnSetProcessInformation = kernel32Lib.func(
      'int SetProcessInformation(void*, int, _In_ PROCESS_POWER_THROTTLING_STATE*, uint32)'
    );
    return true;
  } catch (err) {
    console.warn('[EcoQoS] Failed to load Koffi Win32 FFI:', err);
    kernel32Lib = null;
    return false;
  }
}

/**
 * Configure low-impact process execution across 3 tiers:
 * Tier 1: Win32 native kernel32 SetProcessInformation (EcoQoS E-Cores) + BELOW_NORMAL_PRIORITY_CLASS
 * Tier 2: Windows fallback via os.setPriority(PRIORITY_BELOW_NORMAL)
 * Tier 3: Wine / Proton fallback via os.setPriority(PRIORITY_LOW / nice +10)
 */
export function configureProcessPriority(isWineOrProton = false): EcoQoSResult {
  // Tier 3: Wine / Proton execution environment
  if (isWineOrProton) {
    try {
      if (typeof os.setPriority === 'function') {
        // Priority value 10 corresponds to nice +10 / PRIORITY_LOW
        const lowPrio = os.constants?.priority?.PRIORITY_LOW ?? 10;
        os.setPriority(process.pid, lowPrio);
        return {
          tier: 3,
          mode: 'wine-nice-fallback',
          success: true,
          details: `Applied POSIX nice +10 (priority ${lowPrio}) under Wine/Proton`,
        };
      }
    } catch (wineErr: any) {
      return {
        tier: 3,
        mode: 'wine-nice-fallback',
        success: false,
        details: `Failed to set Wine process priority: ${wineErr?.message || String(wineErr)}`,
      };
    }
  }

  // Tier 1: Windows Native EcoQoS via Koffi FFI
  if (process.platform === 'win32') {
    try {
      if (initKoffiWin32() && fnGetCurrentProcess && fnSetPriorityClass && fnSetProcessInformation) {
        const hProcess = fnGetCurrentProcess();

        // 1. Set BELOW_NORMAL_PRIORITY_CLASS so CPU scheduler prioritizes user interactive foreground tasks
        const priorityRes = fnSetPriorityClass(hProcess, BELOW_NORMAL_PRIORITY_CLASS);

        // 2. Set ProcessPowerThrottling (EcoQoS) to route threads specifically to Efficiency Cores (E-Cores)
        const throttlingState = {
          Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
          ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
          StateMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        };
        const koffi = require('koffi');
        const throttlingRes = fnSetProcessInformation(
          hProcess,
          ProcessPowerThrottling,
          throttlingState,
          koffi.sizeof(ProcessPowerThrottlingStateStruct)
        );

        if (priorityRes && throttlingRes) {
          return {
            tier: 1,
            mode: 'win32-ecoqos',
            success: true,
            details:
              'Active Win32 EcoQoS: ProcessPowerThrottling state applied to E-Cores with BELOW_NORMAL_PRIORITY_CLASS',
          };
        }
      }
    } catch (ffiErr) {
      console.warn('[EcoQoS] Tier 1 Win32 FFI call failed, falling back to Tier 2:', ffiErr);
    }

    // Tier 2: Windows fallback via Node.js native os.setPriority
    try {
      if (typeof os.setPriority === 'function') {
        const belowNormal = os.constants?.priority?.PRIORITY_BELOW_NORMAL ?? 10;
        os.setPriority(process.pid, belowNormal);
        return {
          tier: 2,
          mode: 'win-priority-fallback',
          success: true,
          details: `Tier 2 Fallback: os.setPriority applied (${belowNormal})`,
        };
      }
    } catch (fallbackErr: any) {
      return {
        tier: 2,
        mode: 'win-priority-fallback',
        success: false,
        details: `Tier 2 Fallback error: ${fallbackErr?.message || String(fallbackErr)}`,
      };
    }
  }

  return {
    tier: 2,
    mode: 'win-priority-fallback',
    success: false,
    details: 'Process priority adjustment unsupported on this operating system architecture',
  };
}

/**
 * Restores process to standard normal priority (e.g. when app is foregrounded)
 */
export function restoreProcessPriority(): boolean {
  try {
    if (process.platform === 'win32' && initKoffiWin32() && fnGetCurrentProcess && fnSetPriorityClass) {
      const hProcess = fnGetCurrentProcess();
      fnSetPriorityClass(hProcess, NORMAL_PRIORITY_CLASS);

      if (fnSetProcessInformation) {
        // Clear power throttling mask
        const normalState = {
          Version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
          ControlMask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
          StateMask: 0x0,
        };
        const koffi = require('koffi');
        fnSetProcessInformation(
          hProcess,
          ProcessPowerThrottling,
          normalState,
          koffi.sizeof(ProcessPowerThrottlingStateStruct)
        );
      }
      return true;
    }
    if (typeof os.setPriority === 'function') {
      const normalPrio = os.constants?.priority?.PRIORITY_NORMAL ?? 0;
      os.setPriority(process.pid, normalPrio);
      return true;
    }
  } catch (err) {
    console.warn('[EcoQoS] Failed to restore normal priority:', err);
  }
  return false;
}
