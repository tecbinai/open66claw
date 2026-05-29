/**
 * Setup Wizard - State Management
 * 配置向导的状态管理逻辑
 */

import { loadConfig, writeConfigFile } from "../../../src/config/config.js";
import type { SetupWizardState, ChannelStartCallback } from "./setup-wizard-types.js";

// ============================================================================
// 渠道启动回调
// ============================================================================

let channelStartCallback: ChannelStartCallback | null = null;

export function setChannelStartCallback(callback: ChannelStartCallback): void {
  channelStartCallback = callback;
}

export function getChannelStartCallback(): ChannelStartCallback | null {
  return channelStartCallback;
}

// ============================================================================
// Setup Wizard State Management
// ============================================================================

let setupWizardState: SetupWizardState = {
  step: 1,
  completed: false,
  region: "cn",
};

export function getSetupState(): SetupWizardState {
  const config = loadConfig();
  const hasApiKey = Boolean(
    config.models?.providers && Object.keys(config.models.providers).length > 0,
  );
  const hasWorkspace = Boolean(config.agents?.defaults?.workspace);
  const setupCompleted = Boolean((config as any).setup?.completedAt);

  if (hasApiKey && hasWorkspace && setupCompleted) {
    setupWizardState.completed = true;
  }

  // Resume from the last completed step
  const savedStep = (config as any).setup?.lastCompletedStep;
  if (
    typeof savedStep === "number" &&
    savedStep >= 0 &&
    !setupWizardState.completed &&
    setupWizardState.step <= 1
  ) {
    setupWizardState.step = savedStep + 1;
  }

  return setupWizardState;
}

export function updateSetupState(updates: Partial<SetupWizardState>): SetupWizardState {
  setupWizardState = { ...setupWizardState, ...updates };

  if (typeof updates.step === "number" && updates.step > 1) {
    try {
      const current = loadConfig();
      const lastCompletedStep = updates.step - 1;
      const currentSaved = (current as any).setup?.lastCompletedStep ?? -1;
      if (currentSaved < lastCompletedStep) {
        void writeConfigFile({
          ...current,
          setup: { ...(current as any).setup, lastCompletedStep },
        } as any).catch(() => {
          /* best-effort */
        });
      }
    } catch {
      /* best-effort */
    }
  }

  return setupWizardState;
}
