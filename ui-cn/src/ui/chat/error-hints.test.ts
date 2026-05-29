import { describe, it, expect } from "vitest";
import {
  classifyError,
  getFriendlyErrorMessage,
  cleanRawError,
  formatErrorHint,
  type ErrorCategory,
} from "./error-hints";

describe("error-hints", () => {
  describe("classifyError", () => {
    it("returns unknown for null/undefined", () => {
      expect(classifyError(null)).toBe("unknown");
      expect(classifyError(undefined)).toBe("unknown");
      expect(classifyError("")).toBe("unknown");
    });

    describe("billing errors", () => {
      const billingErrors = [
        "Your credit balance is too low to access the Anthropic API.",
        "402 Payment Required",
        "insufficient credits",
        "You have exceeded your current quota",
        "余额不足",
        "账户欠费",
      ];

      it.each(billingErrors)("classifies '%s' as billing", (error) => {
        expect(classifyError(error)).toBe("billing");
      });
    });

    describe("auth errors", () => {
      const authErrors = [
        "Invalid API key provided",
        "invalid_api_key",
        "401 Unauthorized",
        "403 Forbidden",
        "No credentials found for profile",
        "No API key found",
        "API key 无效",
        "token has expired",
        "Authentication failed",
      ];

      it.each(authErrors)("classifies '%s' as auth", (error) => {
        expect(classifyError(error)).toBe("auth");
      });
    });

    describe("rate limit errors", () => {
      const rateLimitErrors = [
        "429 Too Many Requests",
        "rate limit exceeded",
        "rate_limit_error",
        "resource has been exhausted",
        "请求过于频繁",
      ];

      it.each(rateLimitErrors)("classifies '%s' as rate_limit", (error) => {
        expect(classifyError(error)).toBe("rate_limit");
      });
    });

    describe("timeout errors", () => {
      const timeoutErrors = [
        "Request timeout",
        "Connection timed out",
        "deadline exceeded",
        "ETIMEDOUT",
        "ECONNRESET",
        "超时",
      ];

      it.each(timeoutErrors)("classifies '%s' as timeout", (error) => {
        expect(classifyError(error)).toBe("timeout");
      });
    });

    describe("overloaded errors", () => {
      const overloadedErrors = [
        "overloaded_error",
        "The server is overloaded",
        "503 Service Unavailable",
        "服务繁忙",
      ];

      it.each(overloadedErrors)("classifies '%s' as overloaded", (error) => {
        expect(classifyError(error)).toBe("overloaded");
      });
    });

    describe("network errors", () => {
      const networkErrors = [
        "network error",
        "fetch failed",
        "connection refused",
        "ENOTFOUND",
        "网络错误",
        "连接断开",
        "连接断开 (1006): 无原因",
        "disconnected (1006): no reason",
        "gateway closed (1006)",
      ];

      it.each(networkErrors)("classifies '%s' as network", (error) => {
        expect(classifyError(error)).toBe("network");
      });
    });

    it("returns unknown for unrecognized errors", () => {
      expect(classifyError("Something went wrong")).toBe("unknown");
      expect(classifyError("Random error message")).toBe("unknown");
    });
  });

  describe("getFriendlyErrorMessage", () => {
    const expectedMessages: Record<ErrorCategory, string> = {
      billing: "[E1003] 账户余额不足，请充值后重试",
      auth: "[E1004] API Key 无效或已过期，请检查模型配置",
      rate_limit: "[E1001] 请求频率超限，请稍后重试",
      timeout: "[E1005] 请求超时，请检查以下可能原因",
      overloaded: "[E1002] 模型服务繁忙，请稍后重试",
      network: "[E1006] 网络连接失败，请检查网络设置",
      config: "[E1007] 配置有误，请检查相关设置项",
      internal: "[E1008] 内部错误，请重试。如反复出现请查看日志或反馈",
      unknown: "[E1009] 请求失败，请稍后重试",
    };

    it.each(Object.entries(expectedMessages))(
      "returns correct message for %s",
      (category, expected) => {
        expect(getFriendlyErrorMessage(category as ErrorCategory)).toBe(expected);
      },
    );
  });

  describe("cleanRawError", () => {
    it("returns empty string for null/undefined", () => {
      expect(cleanRawError(null)).toBe("");
      expect(cleanRawError(undefined)).toBe("");
    });

    it("removes common error prefixes", () => {
      expect(cleanRawError("Error: Something went wrong")).toBe("Something went wrong");
      expect(cleanRawError("API Error: Invalid key")).toBe("Invalid key");
      expect(cleanRawError("OpenAI Error: Rate limited")).toBe("Rate limited");
      expect(cleanRawError("Anthropic Error: Overloaded")).toBe("Overloaded");
      expect(cleanRawError("LLM request rejected: Credit balance too low")).toBe(
        "Credit balance too low",
      );
    });

    it("truncates long error messages", () => {
      const longError = "A".repeat(300);
      const cleaned = cleanRawError(longError);
      expect(cleaned.length).toBeLessThanOrEqual(203); // 200 + "..."
      expect(cleaned.endsWith("...")).toBe(true);
    });

    it("preserves short error messages", () => {
      expect(cleanRawError("Short error")).toBe("Short error");
    });
  });

  describe("formatErrorHint", () => {
    it("returns complete hint object for billing error", () => {
      const hint = formatErrorHint("Your credit balance is too low");
      expect(hint.category).toBe("billing");
      expect(hint.friendlyMessage).toBe("[E1003] 账户余额不足，请充值后重试");
      expect(hint.rawError).toBe("Your credit balance is too low");
    });

    it("cleans raw error in hint", () => {
      const hint = formatErrorHint("Error: Invalid API key provided");
      expect(hint.category).toBe("auth");
      expect(hint.rawError).toBe("Invalid API key provided");
    });

    it("handles null/undefined gracefully", () => {
      const hint = formatErrorHint(null);
      expect(hint.category).toBe("unknown");
      expect(hint.friendlyMessage).toBe("[E1009] 请求失败，请稍后重试");
      expect(hint.rawError).toBe("");
    });
  });
});
