import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

/**
 * 读取 OEM 配置文件中的 ui 字段，构建时注入为编译时常量。
 * 优先级：OEM_ID 指定的文件 > 默认值。
 * 只在 VITE_EDITION=overseas 时有效，cn 版直接用 brand.ts 的 cnBrand。
 */
function loadOemUiBrand(): Record<string, string | boolean> {
  const oemId = process.env.OEM_ID ?? "default";
  const oemFile = path.resolve(here, `config/oem/${oemId}.json`);
  const fallbackFile = path.resolve(here, "config/oem/oem-template.json");
  const filePath = fs.existsSync(oemFile)
    ? oemFile
    : fs.existsSync(fallbackFile)
      ? fallbackFile
      : null;
  if (!filePath) {
    // Return defaults when no OEM config exists
    return {
      productName: "66Claw",
      productShortName: "66Claw",
      welcomeTitle: "Welcome to 66Claw",
      windowTitle: "66Claw",
      metaDescription: "66Claw - AI Assistant",
      tagline: "",
      promoUrl: "",
      promoName: "",
      promoDesc: "",
      showPurchaseEntry: false,
      showTrialEntry: false,
      showSupportQrcode: false,
      showAdaptationNotice: false,
      logoPath: "/logo.png",
      bannerPath: "/oem-banner.png",
      skillMirrorHint: "",
      skillExclusiveTitle: "",
      freeModelsEyebrow: "",
      batchMirrorBadge: "",
    };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const ui = (raw["ui"] ?? {}) as Record<string, unknown>;
    return {
      productName: (ui["productName"] as string | undefined) ?? "66Claw",
      productShortName: (ui["productShortName"] as string | undefined) ?? "66Claw",
      welcomeTitle: (ui["welcomeTitle"] as string | undefined) ?? "Welcome to 66Claw",
      windowTitle: (ui["windowTitle"] as string | undefined) ?? "66Claw",
      metaDescription: (ui["metaDescription"] as string | undefined) ?? "66Claw - AI Assistant",
      tagline: (ui["tagline"] as string | undefined) ?? "",
      promoUrl: (ui["promoUrl"] as string | undefined) ?? "",
      promoName: (ui["promoName"] as string | undefined) ?? "",
      promoDesc: (ui["promoDesc"] as string | undefined) ?? "",
      showPurchaseEntry: Boolean(ui["showPurchaseEntry"] ?? false),
      showTrialEntry: Boolean(ui["showTrialEntry"] ?? false),
      showSupportQrcode: Boolean(ui["showSupportQrcode"] ?? false),
      showAdaptationNotice: Boolean(ui["showAdaptationNotice"] ?? false),
      logoPath: (ui["logoPath"] as string | undefined) ?? "/logo.png",
      bannerPath: (ui["bannerPath"] as string | undefined) ?? "/oem-banner.png",
      skillMirrorHint: (ui["skillMirrorHint"] as string | undefined) ?? "",
      skillExclusiveTitle: (ui["skillExclusiveTitle"] as string | undefined) ?? "",
      freeModelsEyebrow: (ui["freeModelsEyebrow"] as string | undefined) ?? "",
      batchMirrorBadge: (ui["batchMirrorBadge"] as string | undefined) ?? "",
    };
  } catch {
    return {};
  }
}

/**
 * 构建时交互式选择版本。
 * 如果已通过 VITE_EDITION 环境变量指定则跳过询问。
 */
async function resolveEdition(): Promise<"cn" | "overseas"> {
  const env = process.env.VITE_EDITION?.trim();
  if (env === "overseas" || env === "cn") {
    return env;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    console.log("\n┌─────────────────────────────────────┐");
    console.log("│  请选择构建版本 (Select Edition)     │");
    console.log("│  1. cn       — 国内包（默认）        │");
    console.log("│  2. overseas — 国际包                │");
    console.log("└─────────────────────────────────────┘");
    rl.question("请输入 1 或 2 (默认 1): ", resolve);
  });
  rl.close();

  const choice = answer.trim();
  const edition = choice === "2" || choice === "overseas" ? "overseas" : "cn";
  process.env.VITE_EDITION = edition;
  console.log(`\n✓ 构建版本: ${edition}\n`);
  return edition;
}

export default defineConfig(async ({ command }) => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  const edition = await resolveEdition();
  const isOverseas = edition === "overseas";
  const oemBrand = loadOemUiBrand();
  const oemDefines: Record<string, string> = {};
  for (const [k, v] of Object.entries(oemBrand)) {
    oemDefines[`__OEM_BRAND_${k.toUpperCase()}__`] = JSON.stringify(v);
  }
  oemDefines["__VITE_EDITION__"] = JSON.stringify(isOverseas ? "overseas" : "cn");
  oemDefines["__VITE_OEM_ID__"] = JSON.stringify(process.env.VITE_OEM_ID ?? "");

  // 计算 index.html 占位符替换值
  // overseas 用 OEM 配置的 windowTitle；cn 包读 apps/desktop/oem/<VITE_OEM_ID>.json 的 displayName
  const cnOemId = process.env.VITE_OEM_ID ?? "";
  let cnOemDisplayName = "66Claw";
  if (cnOemId) {
    const cnOemFile = path.resolve(here, `../apps/desktop/oem/${cnOemId}.json`);
    if (fs.existsSync(cnOemFile)) {
      try {
        const cnOemCfg = JSON.parse(fs.readFileSync(cnOemFile, "utf8")) as Record<string, unknown>;
        cnOemDisplayName = (cnOemCfg["displayName"] as string | undefined) ?? cnOemDisplayName;
      } catch { /* ignore */ }
    }
  }
  const brandTitle = isOverseas
    ? ((oemBrand["windowTitle"] as string | undefined) ?? "66Claw")
    : cnOemDisplayName;
  const brandDesc = isOverseas
    ? ((oemBrand["metaDescription"] as string | undefined) ?? "66Claw - AI Assistant")
    : `${cnOemDisplayName} - 智能 AI 助手`;
  const brandLoading = brandTitle;

  // dev 模式下将 API 请求代理到 gateway（cn:dev 默认 19001，生产 18789）
  const gatewayPort = process.env.OPENCLAW_GATEWAY_PORT ?? "19001";
  const gatewayTarget = `http://127.0.0.1:${gatewayPort}`;

  // transformIndexHtml plugin: replace brand placeholders in index.html at build time
  const htmlBrandPlugin = {
    name: "html-brand-inject",
    transformIndexHtml(html: string) {
      return html
        .replace(/__BRAND_TITLE__/g, brandTitle)
        .replace(/__BRAND_DESC__/g, brandDesc)
        .replace(/__BRAND_LOADING__/g, brandLoading);
    },
  };

  return {
    base,
    define: oemDefines,
    plugins: [htmlBrandPlugin],
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    server: {
      // dev 模式：HTTP + WebSocket 请求统一代理到本地 gateway
      // 根路径 WS 也代理，这样 UI 连 ws://localhost:5173 即可，无需直连 19001
      // 避免浏览器系统代理拦截 WebSocket
      proxy: {
        "/api": { target: gatewayTarget, changeOrigin: true },
        "/health": { target: gatewayTarget, changeOrigin: true },
        "/setup": { target: gatewayTarget, changeOrigin: true },
        "/__openclaw__": { target: gatewayTarget, changeOrigin: true },
        // WS 代理：gateway 在根路径接受 WebSocket upgrade
        "/gw-ws": {
          target: gatewayTarget,
          ws: true,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/gw-ws/, ""),
        },
      },
    },
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      commonjsOptions: {
        include: [/highlight\.js/],
      },
    },
  };
});
