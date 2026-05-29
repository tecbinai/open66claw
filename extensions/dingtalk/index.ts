import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { dingtalkPlugin } from "./src/channel.js";
import { setDingtalkRuntime } from "./src/runtime.js";

const plugin = {
  id: "dingtalk",
  name: "DingTalk",
  description: "钉钉企业应用机器人渠道插件",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setDingtalkRuntime(api.runtime);
    api.registerChannel({ plugin: dingtalkPlugin });
  },
};

export default plugin;
