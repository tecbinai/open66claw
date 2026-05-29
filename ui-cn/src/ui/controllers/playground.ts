import type { GatewayBrowserClient } from "../gateway";
import type { SkillStatusEntry, SkillStatusReport } from "../types";
import type { SkillInstallProgress } from "../views/skill-install-progress";
import { createSimpleProgress } from "./skill-install";

export type PlaygroundState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  playgroundLoading: boolean;
  playgroundReport: SkillStatusReport | null;
  playgroundError: string | null;
  playgroundActiveCategory: string | null;
  playgroundFilter: string;
  // 安装状态
  playgroundInstallingSkill: string | null;
  playgroundInstallMessage: string | null;
  // 技能安装进度弹框
  skillInstallProgress?: SkillInstallProgress | null;
};

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * 加载技能状态报告（用于 playground 页面）
 */
export async function loadPlaygroundSkills(state: PlaygroundState) {
  if (!state.client || !state.connected) return;
  if (state.playgroundLoading) return;
  state.playgroundLoading = true;
  state.playgroundError = null;
  try {
    const res = (await state.client.request("skills.status", {})) as SkillStatusReport | undefined;
    if (res) state.playgroundReport = res;
  } catch (err) {
    state.playgroundError = getErrorMessage(err);
  } finally {
    state.playgroundLoading = false;
  }
}

/**
 * 设置当前激活的分类
 */
export function setPlaygroundCategory(state: PlaygroundState, category: string | null) {
  state.playgroundActiveCategory = category;
}

/**
 * 处理"试用技能"操作
 * 跳转到聊天页面并预填消息
 */
export function handleTrySkill(
  setTab: (tab: "chat") => void,
  setChatMessage: (message: string) => void,
  skillName: string,
  example: string,
) {
  // 设置聊天消息（预填示例）
  setChatMessage(example);
  // 跳转到聊天页面
  setTab("chat");
}

/**
 * 安装技能依赖
 * 当技能缺少依赖但有自动安装选项时使用
 * 显示进度弹框
 */
export async function installSkillDeps(
  state: PlaygroundState,
  skill: SkillStatusEntry,
  onSuccess?: () => void,
) {
  if (!state.client || !state.connected) return;
  if (state.playgroundInstallingSkill) return; // 正在安装其他技能

  // 检查是否有可安装的依赖
  const installOption = skill.install?.[0];
  if (!installOption) {
    state.playgroundInstallMessage = "❌ 此技能没有自动安装选项，请手动配置";
    return;
  }

  state.playgroundInstallingSkill = skill.name;
  state.playgroundInstallMessage = null;

  // 显示进度弹框
  state.skillInstallProgress = createSimpleProgress(skill.name, true);

  try {
    const result = (await state.client.request("skills.install", {
      name: skill.name,
      installId: installOption.id,
      timeoutMs: 180000, // 3 分钟超时
    })) as { ok?: boolean; message?: string };

    // 刷新技能列表
    await loadPlaygroundSkills(state);

    // 更新进度弹框为完成状态
    if (state.skillInstallProgress) {
      state.skillInstallProgress = {
        ...state.skillInstallProgress,
        stage: "complete",
        message: result?.message ?? "🎉 安装成功！",
        percent: 100,
      };
    }

    state.playgroundInstallMessage = result?.message ?? "安装成功！";

    // 安装成功后执行回调
    if (onSuccess) {
      setTimeout(onSuccess, 500);
    }

    // 3秒后自动清除进度弹框和成功消息
    setTimeout(() => {
      if (state.skillInstallProgress?.stage === "complete") {
        state.skillInstallProgress = null;
      }
      if (state.playgroundInstallMessage && !state.playgroundInstallMessage.includes("失败")) {
        state.playgroundInstallMessage = null;
      }
    }, 3000);
  } catch (err) {
    const errorMsg = getErrorMessage(err);

    // 更新进度弹框为失败状态
    if (state.skillInstallProgress) {
      state.skillInstallProgress = {
        ...state.skillInstallProgress,
        stage: "failed",
        message: `安装失败: ${errorMsg}`,
        percent: 0,
      };
    }

    state.playgroundInstallMessage = `安装失败: ${errorMsg}`;

    // 错误消息保留更长时间（5秒）
    setTimeout(() => {
      state.playgroundInstallMessage = null;
    }, 5000);
  } finally {
    state.playgroundInstallingSkill = null;
  }
}

/**
 * 清除安装消息
 */
export function clearInstallMessage(state: PlaygroundState) {
  state.playgroundInstallMessage = null;
}
