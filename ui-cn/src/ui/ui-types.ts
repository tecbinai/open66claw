export type ChatAttachment = {
  id: string;
  dataUrl: string;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  /** UI rendering category, derived from mimeType at creation time. */
  category?: "image" | "video" | "file";
};

export type ChatQueueItem = {
  id: string;
  text: string;
  createdAt: number;
  attachments?: ChatAttachment[];
};

export const CRON_CHANNEL_LAST = "last";

export type CronFormState = {
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: "at" | "every" | "cron";
  scheduleAt: string;
  everyAmount: string;
  everyUnit: "minutes" | "hours" | "days";
  cronExpr: string;
  cronTz: string;
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payloadKind: "systemEvent" | "agentTurn";
  payloadText: string;
  deliver: boolean;
  deliveryMode: "none" | "announce";
  channel: string;
  to: string;
  timeoutSeconds: string;
  postToMainPrefix: string;
};
