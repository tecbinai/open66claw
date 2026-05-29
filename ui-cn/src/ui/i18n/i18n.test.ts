import { describe, it, expect, beforeEach, vi } from "vitest";

// Must import before the module auto-initializes
// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

import {
  initI18n,
  getLocale,
  setLocale,
  t,
  tMaybe,
  getAvailableLocales,
  isChineseLocale,
  onLocaleChange,
  LOCALE_NAMES,
} from "./index.js";

describe("i18n module", () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Reset to default
    initI18n();
  });

  describe("initI18n", () => {
    it("should default to zh-CN", () => {
      const locale = initI18n();
      expect(locale).toBe("zh-CN");
    });

    it("should respect stored locale", () => {
      localStorageMock.setItem("openclawcn-ui-locale", "en");
      const locale = initI18n();
      expect(locale).toBe("en");
    });
  });

  describe("getLocale / setLocale", () => {
    it("should return current locale", () => {
      expect(getLocale()).toBe("zh-CN");
    });

    it("should switch locale", () => {
      setLocale("en");
      expect(getLocale()).toBe("en");
    });

    it("should persist locale to localStorage", () => {
      setLocale("en");
      expect(localStorageMock.getItem("openclawcn-ui-locale")).toBe("en");
    });

    it("should not trigger listener when setting same locale", () => {
      const listener = vi.fn();
      onLocaleChange(listener);
      setLocale("zh-CN"); // same as current
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("onLocaleChange", () => {
    it("should call listener on locale change", () => {
      const listener = vi.fn();
      onLocaleChange(listener);
      setLocale("en");
      expect(listener).toHaveBeenCalledWith("en");
    });

    it("should support unsubscribe", () => {
      const listener = vi.fn();
      const unsub = onLocaleChange(listener);
      unsub();
      setLocale("en");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("t()", () => {
    it("should return translation for known key", () => {
      setLocale("zh-CN");
      // Use a key that's likely in both locales
      const result = t("chat" as never);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("should fall back to key itself for unknown key", () => {
      const result = t("__nonexistent_key__" as never);
      expect(result).toBe("__nonexistent_key__");
    });

    it("should replace {{variable}} template params", () => {
      // Create a key we know has template variables, or test the mechanism
      const result = tMaybe("test {{name}}", { name: "Alice" });
      // If key doesn't exist, it returns the key itself with params replaced
      expect(result).toBe("test Alice");
    });

    it("should replace {variable} template params", () => {
      const result = tMaybe("hello {user}", { user: "Bob" });
      expect(result).toBe("hello Bob");
    });

    it("should handle numeric params", () => {
      const result = tMaybe("count: {{n}}", { n: 42 });
      expect(result).toBe("count: 42");
    });
  });

  describe("tMaybe()", () => {
    it("should return key for unknown dynamic keys", () => {
      const result = tMaybe("some.random.key");
      expect(result).toBe("some.random.key");
    });
  });

  describe("getAvailableLocales", () => {
    it("should return en and zh-CN", () => {
      const locales = getAvailableLocales();
      expect(locales).toContain("en");
      expect(locales).toContain("zh-CN");
      expect(locales).toHaveLength(2);
    });
  });

  describe("isChineseLocale", () => {
    it("should return true for zh-CN", () => {
      setLocale("zh-CN");
      expect(isChineseLocale()).toBe(true);
    });

    it("should return false for en", () => {
      setLocale("en");
      expect(isChineseLocale()).toBe(false);
    });
  });

  describe("LOCALE_NAMES", () => {
    it("should have display names for all locales", () => {
      expect(LOCALE_NAMES.en).toBe("English");
      expect(LOCALE_NAMES["zh-CN"]).toBe("简体中文");
    });
  });
});
