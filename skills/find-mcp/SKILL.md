---
name: find-mcp
description: 从本地 MCP 工具市场搜索索引中发现和推荐 MCP 工具服务。支持中英文关键词搜索。在创建新 Agent 或用户寻找 MCP 工具扩展时使用。
metadata:
  {
    "openclaw": {
      "requires": { "bins": ["node"] },
      "always": false,
      "emoji": "🔌"
    }
  }
---

# MCP 工具搜索（Find MCP）

从本地 MCP Marketplace 搜索索引中搜索 MCP 工具服务。纯本地搜索，零网络请求。

## 搜索 MCP 工具

```bash
node skills/find-mcp/search.mjs "关键词"
node skills/find-mcp/search.mjs "代码"
node skills/find-mcp/search.mjs "database"
```

输出：JSON 数组，每个元素含 id、n(名称)、d(描述)、c(分类)、t(标签)。

## 搜索结果字段

| 字段 | 说明 |
|------|------|
| `id` | MCP 服务唯一标识 |
| `n` | 中文名称 |
| `d` | 中文描述 |
| `c` | 分类 |
| `t` | 标签数组 |

## 注意

- 数据源：`extensions/cn-adapter/mcp-marketplace/data/search-index.json`（随项目打包）
- 支持中英文关键词（索引以中文为主）
- 匹配范围：名称、描述、标签、ID
- 最多返回 10 条结果
