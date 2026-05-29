/**
 * feishu_sheet — 电子表格工具
 *
 * Actions: meta | read | write | append | batch_update | create |
 *          add_sheet | delete_rows | insert_rows | format
 *
 * NOTE: Feishu Sheets v2 API is not fully covered by Lark SDK, so we use
 * client.request() for raw HTTP calls where needed.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { getToolClient, json } from "../shared.js";
import { FeishuSheetSchema, type FeishuSheetParams } from "./sheet-schema.js";

const SHEETS_V2_BASE = "/open-apis/sheets/v2/spreadsheets";
const SHEETS_V3_BASE = "/open-apis/sheets/v3/spreadsheets";

export function registerFeishuSheetTools(api: OpenClawPluginApi) {
  api.registerTool({
    name: "feishu_sheet",
    label: "Feishu Sheet (飞书电子表格)",
    description:
      "Feishu spreadsheet operations. Actions: meta, read, write, append, batch_update, create, add_sheet, delete_rows, insert_rows, format",
    parameters: FeishuSheetSchema,
    async execute(_toolCallId, params) {
      const p = params as FeishuSheetParams;
      try {
        const client = getToolClient(api, p.accountId);

        switch (p.action) {
          // ── meta ─────────────────────────────────────────
          case "meta": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            const res = await client.request({
              method: "GET",
              url: `${SHEETS_V3_BASE}/${p.spreadsheet_token}`,
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data?.spreadsheet);
          }

          // ── read ─────────────────────────────────────────
          case "read": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.range) return json({ error: "range is required (e.g. Sheet1!A1:C10)" });
            const res = await client.request({
              method: "GET",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/values/${encodeURIComponent(p.range)}`,
              params: {
                valueRenderOption: "ToString",
                dateTimeRenderOption: "FormattedString",
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data?.valueRange);
          }

          // ── write ────────────────────────────────────────
          case "write": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.range) return json({ error: "range is required" });
            if (!p.values) return json({ error: "values (2D array) is required" });
            const res = await client.request({
              method: "PUT",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/values`,
              data: {
                valueRange: {
                  range: p.range,
                  values: p.values,
                },
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── append ───────────────────────────────────────
          case "append": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.range) return json({ error: "range is required" });
            if (!p.values) return json({ error: "values (2D array) is required" });
            const res = await client.request({
              method: "POST",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/values_append`,
              data: {
                valueRange: {
                  range: p.range,
                  values: p.values,
                },
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── batch_update ─────────────────────────────────
          case "batch_update": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.ranges?.length) return json({ error: "ranges array is required" });
            const res = await client.request({
              method: "POST",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/values_batch_update`,
              data: {
                valueRanges: p.ranges.map((r) => ({
                  range: r.range,
                  values: r.values,
                })),
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── create spreadsheet ───────────────────────────
          case "create": {
            if (!p.title) return json({ error: "title is required" });
            const res = await client.request({
              method: "POST",
              url: SHEETS_V3_BASE,
              data: {
                title: p.title,
                folder_token: p.folder_token,
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data?.spreadsheet);
          }

          // ── add sheet (tab) ──────────────────────────────
          case "add_sheet": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.sheet_title) return json({ error: "sheet_title is required" });
            const res = await client.request({
              method: "POST",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/sheets_batch_update`,
              data: {
                requests: [
                  {
                    addSheet: {
                      properties: { title: p.sheet_title },
                    },
                  },
                ],
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── delete rows ──────────────────────────────────
          case "delete_rows": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.sheet_id) return json({ error: "sheet_id is required" });
            if (p.start_index == null || !p.count)
              return json({ error: "start_index and count are required" });
            const res = await client.request({
              method: "POST",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/sheets_batch_update`,
              data: {
                requests: [
                  {
                    deleteDimension: {
                      range: {
                        sheetId: p.sheet_id,
                        majorDimension: "ROWS",
                        startIndex: p.start_index,
                        endIndex: p.start_index + p.count,
                      },
                    },
                  },
                ],
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── insert rows ──────────────────────────────────
          case "insert_rows": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.sheet_id) return json({ error: "sheet_id is required" });
            if (p.start_index == null || !p.count)
              return json({ error: "start_index and count are required" });
            const res = await client.request({
              method: "POST",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/sheets_batch_update`,
              data: {
                requests: [
                  {
                    insertDimension: {
                      range: {
                        sheetId: p.sheet_id,
                        majorDimension: "ROWS",
                        startIndex: p.start_index,
                        endIndex: p.start_index + p.count,
                      },
                      inheritStyle: "BEFORE",
                    },
                  },
                ],
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          // ── format ───────────────────────────────────────
          case "format": {
            if (!p.spreadsheet_token) return json({ error: "spreadsheet_token is required" });
            if (!p.range) return json({ error: "range is required" });
            if (!p.style) return json({ error: "style object is required" });
            const stylePayload: Record<string, unknown> = {};
            if (p.style.bold !== undefined) stylePayload.bold = p.style.bold;
            if (p.style.italic !== undefined) stylePayload.italic = p.style.italic;
            if (p.style.font_size !== undefined) stylePayload.fontSize = `${p.style.font_size}pt`;
            if (p.style.fore_color) stylePayload.foreColor = p.style.fore_color;
            if (p.style.back_color) stylePayload.backColor = p.style.back_color;
            if (p.style.h_align) stylePayload.hAlign = p.style.h_align;
            if (p.style.v_align) stylePayload.vAlign = p.style.v_align;
            const res = await client.request({
              method: "PUT",
              url: `${SHEETS_V2_BASE}/${p.spreadsheet_token}/styles_batch_update`,
              data: {
                data: [{ ranges: p.range, style: stylePayload }],
              },
            });
            const data = res as Record<string, any>;
            if (data.code !== 0) throw new Error(data.msg);
            return json(data.data);
          }

          default:
            return json({ error: `Unknown action: ${String(p.action)}` });
        }
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  });
}
