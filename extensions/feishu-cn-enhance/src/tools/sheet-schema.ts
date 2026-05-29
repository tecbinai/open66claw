import { Type, type Static } from "@sinclair/typebox";

const SHEET_ACTION_VALUES = [
  "meta",
  "read",
  "write",
  "append",
  "batch_update",
  "create",
  "add_sheet",
  "delete_rows",
  "insert_rows",
  "format",
] as const;

export const FeishuSheetSchema = Type.Object({
  action: Type.Unsafe<(typeof SHEET_ACTION_VALUES)[number]>({
    type: "string",
    enum: [...SHEET_ACTION_VALUES],
    description:
      "Action: meta | read | write | append | batch_update | create | add_sheet | delete_rows | insert_rows | format",
  }),

  // spreadsheet token (from URL: /sheets/{token})
  spreadsheet_token: Type.Optional(
    Type.String({ description: "Spreadsheet token (from URL). Required for most actions." }),
  ),

  // sheet id within a spreadsheet
  sheet_id: Type.Optional(
    Type.String({ description: "Sheet (tab) ID within the spreadsheet" }),
  ),

  // range for read/write (e.g. "Sheet1!A1:C10" or "A1:C10")
  range: Type.Optional(
    Type.String({
      description: 'Cell range, e.g. "A1:C10" or "Sheet1!A1:C10". For read/write/append.',
    }),
  ),

  // values for write/append — 2D array
  values: Type.Optional(
    Type.Array(Type.Array(Type.Any()), {
      description: "2D array of cell values for write/append/batch_update",
    }),
  ),

  // batch_update: multiple ranges
  ranges: Type.Optional(
    Type.Array(
      Type.Object({
        range: Type.String({ description: "Cell range" }),
        values: Type.Array(Type.Array(Type.Any()), { description: "2D cell values" }),
      }),
      { description: "Multiple range+values pairs (for batch_update)" },
    ),
  ),

  // create
  title: Type.Optional(Type.String({ description: "Spreadsheet title (for create)" })),
  folder_token: Type.Optional(
    Type.String({ description: "Folder token to create spreadsheet in" }),
  ),

  // add_sheet
  sheet_title: Type.Optional(Type.String({ description: "New sheet (tab) name" })),

  // insert_rows / delete_rows
  start_index: Type.Optional(
    Type.Number({ description: "Start row index (0-based, for insert/delete rows)" }),
  ),
  count: Type.Optional(Type.Number({ description: "Number of rows to insert/delete" })),

  // format
  style: Type.Optional(
    Type.Object(
      {
        bold: Type.Optional(Type.Boolean()),
        italic: Type.Optional(Type.Boolean()),
        font_size: Type.Optional(Type.Number()),
        fore_color: Type.Optional(Type.String({ description: "Text color, e.g. #FF0000" })),
        back_color: Type.Optional(Type.String({ description: "Background color, e.g. #FFFF00" })),
        h_align: Type.Optional(
          Type.String({ description: "Horizontal alignment: LEFT | CENTER | RIGHT" }),
        ),
        v_align: Type.Optional(
          Type.String({ description: "Vertical alignment: TOP | MIDDLE | BOTTOM" }),
        ),
      },
      { description: "Cell style (for format action)" },
    ),
  ),

  // account routing
  accountId: Type.Optional(Type.String({ description: "Feishu account ID (multi-account)" })),
});

export type FeishuSheetParams = Static<typeof FeishuSheetSchema>;
