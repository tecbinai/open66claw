import { describe, it, expect } from "vitest";
import {
  migrateConfig,
  getCurrentConfigVersion,
  separateCnPluginFromConfig,
  applyMergeStrategy,
  validateConfigRoundTrip,
  MIGRATIONS,
} from "../migration.js";

describe("getCurrentConfigVersion", () => {
  it("returns 0 for empty config", () => {
    expect(getCurrentConfigVersion({})).toBe(0);
  });

  it("returns 0 if cnPlugin exists but no configVersion", () => {
    expect(getCurrentConfigVersion({ cnPlugin: { locale: "zh-CN" } })).toBe(0);
  });

  it("returns version number from cnPlugin.configVersion", () => {
    expect(getCurrentConfigVersion({ cnPlugin: { configVersion: 3 } })).toBe(3);
  });
});

describe("applyMergeStrategy", () => {
  it("fill-empty: sets value when path does not exist", () => {
    const result = applyMergeStrategy({}, "tools.exec.host", "gateway", "fill-empty");
    expect(result).toEqual({ tools: { exec: { host: "gateway" } } });
  });

  it("fill-empty: does NOT overwrite existing value", () => {
    const config = { tools: { exec: { host: "sandbox" } } };
    const result = applyMergeStrategy(config, "tools.exec.host", "gateway", "fill-empty");
    expect(result.tools).toEqual({ exec: { host: "sandbox" } });
  });

  it("force-overwrite: always overwrites", () => {
    const config = { cnPlugin: { configVersion: 1 } };
    const result = applyMergeStrategy(config, "cnPlugin.configVersion", 2, "force-overwrite");
    expect(result.cnPlugin).toEqual({ configVersion: 2 });
  });

  it("deep-merge: merges objects recursively", () => {
    const config = { tools: { exec: { host: "sandbox", timeout: 30 } } };
    const result = applyMergeStrategy(
      config,
      "tools.exec",
      { host: "gateway", security: "full" },
      "deep-merge",
    );
    expect(result.tools).toEqual({ exec: { host: "gateway", security: "full", timeout: 30 } });
  });

  it("does not mutate input config", () => {
    const config = { tools: { exec: { host: "sandbox" } } };
    const copy = JSON.parse(JSON.stringify(config));
    applyMergeStrategy(config, "tools.exec.host", "gateway", "force-overwrite");
    expect(config).toEqual(copy);
  });
});

describe("migrateConfig", () => {
  it("applies all migrations to empty config", () => {
    const { config, applied } = migrateConfig({});
    expect(applied).toContain(1);
    expect(applied).toContain(2);
    expect(config.tools).toBeDefined();
    expect((config.tools as any).exec.host).toBe("gateway");
    expect((config.tools as any).exec.security).toBe("full");
    expect((config.cnPlugin as any).configVersion).toBe(9);
    expect((config.cnPlugin as any).locale).toBe("zh-CN");
    // v5: channel plugins enabled
    expect((config.plugins as any).entries.feishu.enabled).toBe(true);
    expect((config.plugins as any).entries.dingtalk.enabled).toBe(true);
    // v6: exec ask off, maxConcurrent 6, web search enabled
    expect((config.tools as any).exec.ask).toBe("off");
    expect((config.agents as any).defaults.maxConcurrent).toBe(6);
    expect((config.tools as any).web.search.enabled).toBe(true);
    // v7: all channels dmPolicy=open, groupPolicy=open, device auth disabled
    expect((config.channels as any).feishu.dmPolicy).toBe("open");
    expect((config.channels as any).feishu.allowFrom).toEqual(["*"]);
    expect((config.channels as any).feishu.groupPolicy).toBe("open");
    expect((config.channels as any).telegram.dmPolicy).toBe("open");
    expect((config.channels as any).dingtalk.groupPolicy).toBe("open");
    expect((config.gateway as any).controlUi.dangerouslyDisableDeviceAuth).toBe(true);
  });

  it("skips already-applied migrations", () => {
    const { applied, skipped } = migrateConfig({ cnPlugin: { configVersion: 9 } });
    expect(skipped).toContain(1);
    expect(skipped).toContain(2);
    expect(skipped).toContain(3);
    expect(skipped).toContain(4);
    expect(skipped).toContain(5);
    expect(skipped).toContain(6);
    expect(skipped).toContain(7);
    expect(skipped).toContain(8);
    expect(skipped).toContain(9);
    expect(applied).toHaveLength(0);
  });

  it("preserves user overrides with fill-empty strategy", () => {
    const { config } = migrateConfig({ tools: { exec: { host: "sandbox" } } });
    // fill-empty 不覆盖用户已设置的 "sandbox"
    expect((config.tools as any).exec.host).toBe("sandbox");
    // 但 security 没设置过，应该被填充
    expect((config.tools as any).exec.security).toBe("full");
  });

  it("respects targetVersion parameter", () => {
    const { applied } = migrateConfig({}, 0);
    expect(applied).toHaveLength(0);
  });
});

describe("validateConfigRoundTrip", () => {
  it("returns true for valid config", () => {
    expect(validateConfigRoundTrip({ key: "value", nested: { num: 42 } })).toBe(true);
  });

  it("returns false for config with circular references", () => {
    const obj: any = {};
    obj.self = obj;
    expect(validateConfigRoundTrip(obj)).toBe(false);
  });
});

describe("MIGRATIONS integrity", () => {
  it("versions are strictly increasing", () => {
    for (let i = 1; i < MIGRATIONS.length; i++) {
      expect(MIGRATIONS[i].version).toBeGreaterThan(MIGRATIONS[i - 1].version);
    }
  });

  it("all changes have valid strategy", () => {
    const validStrategies = ["fill-empty", "deep-merge", "force-overwrite"];
    for (const migration of MIGRATIONS) {
      for (const change of migration.changes) {
        expect(validStrategies).toContain(change.strategy);
      }
    }
  });
});

describe("v2 migration", () => {
  it("migrates from v1 to v2: adds models field", () => {
    const v1Result = migrateConfig({}, 1);
    const v2Result = migrateConfig(v1Result.config, 2);
    expect((v2Result.config.cnPlugin as any).configVersion).toBe(2);
    expect((v2Result.config.cnPlugin as any).models).toEqual({});
    expect(v2Result.applied).toHaveLength(1);
  });

  it("migrates from scratch to v2: applies both v1 and v2", () => {
    const result = migrateConfig({}, 2);
    expect((result.config.cnPlugin as any).configVersion).toBe(2);
    expect((result.config.cnPlugin as any).locale).toBe("zh-CN");
    expect((result.config.cnPlugin as any).models).toEqual({});
    expect(result.applied).toHaveLength(2);
  });

  it("v2 fill-empty does not overwrite existing models", () => {
    const existing = {
      cnPlugin: {
        configVersion: 1,
        models: { default: { provider: "siliconflow", model: "deepseek-v3" } },
      },
    };
    const result = migrateConfig(existing, 2);
    expect((result.config.cnPlugin as any).models).toEqual({
      default: { provider: "siliconflow", model: "deepseek-v3" },
    });
  });
});

describe("v3 migration", () => {
  it("migrates from v2 to v3: adds proxy, telemetry, updateChannel", () => {
    const v2Config = { cnPlugin: { configVersion: 2 } };
    const result = migrateConfig(v2Config, 3);
    expect((result.config.cnPlugin as any).configVersion).toBe(3);
    expect((result.config.cnPlugin as any).proxy).toEqual({ enabled: false });
    expect((result.config.cnPlugin as any).telemetry).toBe(false);
    expect((result.config.cnPlugin as any).updateChannel).toBe("stable");
    expect(result.applied).toEqual([3]);
  });

  it("migrates from scratch to v3: applies all", () => {
    const result = migrateConfig({}, 3);
    expect((result.config.cnPlugin as any).configVersion).toBe(3);
    expect((result.config.cnPlugin as any).locale).toBe("zh-CN");
    expect((result.config.cnPlugin as any).models).toEqual({});
    expect((result.config.cnPlugin as any).proxy).toEqual({ enabled: false });
    expect((result.config.cnPlugin as any).telemetry).toBe(false);
    expect((result.config.cnPlugin as any).updateChannel).toBe("stable");
    expect(result.applied).toHaveLength(3);
  });

  it("v3 fill-empty does not overwrite existing values", () => {
    const existing = {
      cnPlugin: {
        configVersion: 2,
        proxy: { enabled: true, noProxy: ["*.example.com"] },
        telemetry: true,
        updateChannel: "beta",
      },
    };
    const result = migrateConfig(existing, 3);
    expect((result.config.cnPlugin as any).proxy).toEqual({
      enabled: true,
      noProxy: ["*.example.com"],
    });
    expect((result.config.cnPlugin as any).telemetry).toBe(true);
    expect((result.config.cnPlugin as any).updateChannel).toBe("beta");
  });
});

describe("v5 migration", () => {
  it("migrates from v4 to v5: enables channel plugins", () => {
    const v4Config = { cnPlugin: { configVersion: 4 } };
    const result = migrateConfig(v4Config, 5);
    expect((result.config.cnPlugin as any).configVersion).toBe(5);
    expect((result.config.plugins as any).entries.feishu.enabled).toBe(true);
    expect((result.config.plugins as any).entries.dingtalk.enabled).toBe(true);
    expect((result.config.plugins as any).entries.wecom.enabled).toBe(true);
    expect((result.config.plugins as any).entries.telegram.enabled).toBe(true);
    expect((result.config.plugins as any).entries.discord.enabled).toBe(true);
    expect((result.config.plugins as any).entries.slack.enabled).toBe(true);
    expect(result.applied).toEqual([5]);
  });

  it("v5 fill-empty does not overwrite user-disabled channels", () => {
    const existing = {
      cnPlugin: { configVersion: 4 },
      plugins: { entries: { feishu: { enabled: false } } },
    };
    const result = migrateConfig(existing, 5);
    // User explicitly disabled feishu — fill-empty should not overwrite
    expect((result.config.plugins as any).entries.feishu.enabled).toBe(false);
    // But dingtalk was not set, should be enabled
    expect((result.config.plugins as any).entries.dingtalk.enabled).toBe(true);
  });
});

describe("v6 migration", () => {
  it("migrates from v5 to v6: adds exec.ask, maxConcurrent, timeouts, search", () => {
    const v5Config = { cnPlugin: { configVersion: 5 } };
    const result = migrateConfig(v5Config, 6);
    expect((result.config.cnPlugin as any).configVersion).toBe(6);
    expect(result.applied).toEqual([6]);

    // exec.ask = "off"
    expect((result.config.tools as any).exec.ask).toBe("off");

    // safeBins array
    const safeBins = (result.config.tools as any).exec.safeBins;
    expect(Array.isArray(safeBins)).toBe(true);
    expect(safeBins.length).toBeGreaterThan(50);
    expect(safeBins).toContain("git");
    expect(safeBins).toContain("node");
    expect(safeBins).toContain("python3");
    expect(safeBins).toContain("docker");
    expect(safeBins).toContain("curl");

    // agent defaults
    expect((result.config.agents as any).defaults.maxConcurrent).toBe(6);
    expect((result.config.agents as any).defaults.timeoutSeconds).toBe(1800);

    // web timeouts
    expect((result.config.tools as any).web.search.timeoutSeconds).toBe(60);
    expect((result.config.tools as any).web.fetch.timeoutSeconds).toBe(60);

    // web search enabled
    expect((result.config.tools as any).web.search.enabled).toBe(true);
  });

  it("v6 fill-empty does not overwrite user's existing exec.ask", () => {
    const existing = {
      cnPlugin: { configVersion: 5 },
      tools: { exec: { ask: "on-miss" } },
    };
    const result = migrateConfig(existing, 6);
    // User explicitly set ask="on-miss" — fill-empty should not overwrite
    expect((result.config.tools as any).exec.ask).toBe("on-miss");
  });

  it("v6 fill-empty does not overwrite user's maxConcurrent", () => {
    const existing = {
      cnPlugin: { configVersion: 5 },
      agents: { defaults: { maxConcurrent: 2 } },
    };
    const result = migrateConfig(existing, 6);
    expect((result.config.agents as any).defaults.maxConcurrent).toBe(2);
  });

  it("v6 fill-empty does not overwrite user's web timeouts", () => {
    const existing = {
      cnPlugin: { configVersion: 5 },
      tools: { web: { search: { timeoutSeconds: 120 }, fetch: { timeoutSeconds: 90 } } },
    };
    const result = migrateConfig(existing, 6);
    expect((result.config.tools as any).web.search.timeoutSeconds).toBe(120);
    expect((result.config.tools as any).web.fetch.timeoutSeconds).toBe(90);
  });

  it("v6 full migration configVersion is 6 when capped", () => {
    const result = migrateConfig({}, 6);
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6]);
    expect((result.config.cnPlugin as any).configVersion).toBe(6);

    // v1 fields
    expect((result.config.tools as any).exec.host).toBe("gateway");
    expect((result.config.tools as any).exec.security).toBe("full");

    // v6 fields
    expect((result.config.tools as any).exec.ask).toBe("off");
    expect((result.config.agents as any).defaults.maxConcurrent).toBe(6);
    expect((result.config.agents as any).defaults.timeoutSeconds).toBe(1800);
    expect((result.config.tools as any).web.search.enabled).toBe(true);
    expect((result.config.tools as any).web.search.timeoutSeconds).toBe(60);
    expect((result.config.tools as any).web.fetch.timeoutSeconds).toBe(60);
  });
});

describe("v7 migration", () => {
  it("migrates from v6 to v7: channels open + groups open + device auth disabled", () => {
    const v6Config = { cnPlugin: { configVersion: 6 } };
    const result = migrateConfig(v6Config, 7);
    expect((result.config.cnPlugin as any).configVersion).toBe(7);
    expect(result.applied).toEqual([7]);

    // All CN channels: DM open + group open
    const channels = result.config.channels as any;
    // Channels with groupAllowFrom in schema
    for (const ch of ["feishu", "dingtalk", "wecom", "telegram", "whatsapp"]) {
      expect(channels[ch].dmPolicy).toBe("open");
      expect(channels[ch].allowFrom).toEqual(["*"]);
      expect(channels[ch].groupPolicy).toBe("open");
      expect(channels[ch].groupAllowFrom).toEqual(["*"]);
    }
    // Discord & Slack: no groupAllowFrom (their schemas don't support it)
    for (const ch of ["discord", "slack"]) {
      expect(channels[ch].dmPolicy).toBe("open");
      expect(channels[ch].allowFrom).toEqual(["*"]);
      expect(channels[ch].groupPolicy).toBe("open");
      expect(channels[ch].groupAllowFrom).toBeUndefined();
    }

    // Device auth disabled for desktop
    expect((result.config.gateway as any).controlUi.dangerouslyDisableDeviceAuth).toBe(true);
  });

  it("v7 fill-empty does not overwrite user's existing dmPolicy", () => {
    const existing = {
      cnPlugin: { configVersion: 6 },
      channels: { feishu: { dmPolicy: "pairing" } },
    };
    const result = migrateConfig(existing, 7);
    expect((result.config.channels as any).feishu.dmPolicy).toBe("pairing");
    expect((result.config.channels as any).dingtalk.dmPolicy).toBe("open");
  });

  it("v7 fill-empty does not overwrite user's existing groupPolicy", () => {
    const existing = {
      cnPlugin: { configVersion: 6 },
      channels: { telegram: { groupPolicy: "allowlist", groupAllowFrom: ["group1"] } },
    };
    const result = migrateConfig(existing, 7);
    expect((result.config.channels as any).telegram.groupPolicy).toBe("allowlist");
    expect((result.config.channels as any).telegram.groupAllowFrom).toEqual(["group1"]);
    // DM still gets open since it was empty
    expect((result.config.channels as any).telegram.dmPolicy).toBe("open");
  });

  it("v7 fill-empty does not overwrite user's existing device auth setting", () => {
    const existing = {
      cnPlugin: { configVersion: 6 },
      gateway: { controlUi: { dangerouslyDisableDeviceAuth: false } },
    };
    const result = migrateConfig(existing, 7);
    // User explicitly set false — fill-empty should not overwrite
    expect((result.config.gateway as any).controlUi.dangerouslyDisableDeviceAuth).toBe(false);
  });

  it("full migration from scratch includes all v9 defaults", () => {
    const result = migrateConfig({});
    expect(result.applied).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect((result.config.cnPlugin as any).configVersion).toBe(9);
    // v7 channel defaults
    expect((result.config.channels as any).feishu.dmPolicy).toBe("open");
    expect((result.config.channels as any).feishu.groupPolicy).toBe("open");
    expect((result.config.channels as any).whatsapp.allowFrom).toEqual(["*"]);
    expect((result.config.gateway as any).controlUi.dangerouslyDisableDeviceAuth).toBe(true);
    // v8 capabilities
    expect((result.config.browser as any).enabled).toBe(true);
    expect((result.config.tools as any).web.search.enabled).toBe(true);
    expect((result.config.tools as any).media.image.enabled).toBe(true);
    // v9 plugin entries — CN recommended ON
    expect((result.config.plugins as any).entries["memory-core"].enabled).toBe(true);
    expect((result.config.plugins as any).entries["memory-lancedb"].enabled).toBe(true);
    expect((result.config.plugins as any).entries.openclawwechat.enabled).toBe(true);
    expect((result.config.plugins as any).entries.qqbot.enabled).toBe(true);
    expect((result.config.plugins as any).entries["minimax-portal-auth"].enabled).toBe(true);
    // v9 plugin entries — overseas OFF
    expect((result.config.plugins as any).entries.whatsapp.enabled).toBe(false);
    expect((result.config.plugins as any).entries.signal.enabled).toBe(false);
    expect((result.config.plugins as any).entries.twitch.enabled).toBe(false);
    expect((result.config.plugins as any).entries.ollama.enabled).toBe(true);
  });
});

describe("separateCnPluginFromConfig", () => {
  it("removes cnPlugin from config and returns it separately", () => {
    const { config: migrated } = migrateConfig({});
    const { upstreamConfig, cnPluginValues, configVersion } = separateCnPluginFromConfig(migrated);

    // upstreamConfig should NOT have cnPlugin
    expect(upstreamConfig.cnPlugin).toBeUndefined();
    // But should still have upstream fields
    expect((upstreamConfig.tools as any).exec.host).toBe("gateway");
    expect((upstreamConfig.plugins as any).entries.feishu.enabled).toBe(true);

    // cnPluginValues should have the CN-specific values
    expect(cnPluginValues.configVersion).toBe(9);
    expect(cnPluginValues.locale).toBe("zh-CN");

    // configVersion extracted correctly
    expect(configVersion).toBe(9);
  });

  it("returns configVersion=0 when no cnPlugin exists", () => {
    const { upstreamConfig, cnPluginValues, configVersion } = separateCnPluginFromConfig({
      tools: { exec: { host: "gateway" } },
    });
    expect(upstreamConfig.cnPlugin).toBeUndefined();
    expect(upstreamConfig.tools).toBeDefined();
    expect(cnPluginValues).toEqual({});
    expect(configVersion).toBe(0);
  });

  it("does not mutate input config", () => {
    const input = { cnPlugin: { configVersion: 5, locale: "zh-CN" }, tools: { exec: {} } };
    const copy = JSON.parse(JSON.stringify(input));
    separateCnPluginFromConfig(input);
    expect(input).toEqual(copy);
  });
});
