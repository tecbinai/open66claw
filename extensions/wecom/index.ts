import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { wecomPlugin } from "./src/channel.js";
import { setWecomRuntime } from "./src/runtime.js";

const plugin = {
  id: "wecom",
  name: "WeCom",
  description: "企业微信渠道插件",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setWecomRuntime(api.runtime);
    api.registerChannel({ plugin: wecomPlugin });
  },
};

export default plugin;
