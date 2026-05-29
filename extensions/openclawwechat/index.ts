import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { openclawwechatPlugin } from "./src/channel.js";
import { setWechatRuntime } from "./src/runtime.js";

const plugin = {
  id: "openclawwechat",
  name: "WeChat Personal",
  description: "个人微信渠道插件 - 通过 ClawChat 桥接服务接入",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    setWechatRuntime(api.runtime);
    api.registerChannel({ plugin: openclawwechatPlugin });
  },
};

export default plugin;
