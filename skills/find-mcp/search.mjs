#!/usr/bin/env node
// find-mcp: 从本地 MCP Marketplace 搜索索引中搜索服务
import { readFile } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 搜索索引位置（相对于项目根目录）
const INDEX_PATH = resolve(
  __dirname,
  "../../extensions/cn-adapter/mcp-marketplace/data/search-index.json"
);

const keyword = process.argv[2];
if (!keyword) {
  console.error("用法: node search.mjs <关键词>");
  console.error("示例: node search.mjs 代码");
  process.exit(1);
}

try {
  const raw = await readFile(INDEX_PATH, "utf-8");
  const index = JSON.parse(raw);
  const lower = keyword.toLowerCase();

  const matched = index
    .filter(
      (e) =>
        (e.n && e.n.toLowerCase().includes(lower)) ||
        (e.d && e.d.toLowerCase().includes(lower)) ||
        (e.t && e.t.some((t) => t.toLowerCase().includes(lower))) ||
        (e.id && e.id.toLowerCase().includes(lower))
    )
    .slice(0, 10); // 最多返回 10 条

  console.log(JSON.stringify(matched, null, 2));
  console.error(`\n共匹配 ${matched.length} 条结果`);
} catch (e) {
  if (e.code === "ENOENT") {
    console.error("搜索索引文件不存在:", INDEX_PATH);
    console.error("请确认 MCP Marketplace 数据已初始化");
  } else {
    console.error("搜索失败:", e.message);
  }
  process.exit(1);
}
