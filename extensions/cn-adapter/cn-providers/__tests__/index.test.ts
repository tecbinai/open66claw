import { describe, it, expect, vi } from "vitest";
import { registerCnProviders } from "../index.js";

describe("registerCnProviders", () => {
  it("calls registerProvider twice (siliconflow + volcengine-embedding)", () => {
    const api = {
      registerProvider: vi.fn(),
    } as any;

    registerCnProviders(api);

    expect(api.registerProvider).toHaveBeenCalledTimes(2);

    const calls = api.registerProvider.mock.calls;
    const ids = calls.map((c: any) => c[0].id);
    expect(ids).toContain("siliconflow");
    expect(ids).toContain("volcengine-embedding");
  });

  it("does not throw with a no-op api", () => {
    const api = {
      registerProvider: () => {},
    } as any;

    expect(() => registerCnProviders(api)).not.toThrow();
  });

  it("registers providers with valid auth arrays", () => {
    const api = {
      registerProvider: vi.fn(),
    } as any;

    registerCnProviders(api);

    for (const [provider] of api.registerProvider.mock.calls) {
      expect(provider.auth).toBeDefined();
      expect(Array.isArray(provider.auth)).toBe(true);
      expect(provider.auth.length).toBeGreaterThan(0);
      for (const auth of provider.auth) {
        expect(auth.id).toBeTruthy();
        expect(auth.kind).toBeTruthy();
        expect(typeof auth.run).toBe("function");
      }
    }
  });

  it("registers providers with valid model configs", () => {
    const api = {
      registerProvider: vi.fn(),
    } as any;

    registerCnProviders(api);

    for (const [provider] of api.registerProvider.mock.calls) {
      expect(provider.models).toBeDefined();
      expect(provider.models.baseUrl).toBeTruthy();
      expect(provider.models.api).toBeTruthy();
      expect(provider.models.models.length).toBeGreaterThan(0);
    }
  });
});
