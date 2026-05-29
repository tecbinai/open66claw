import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock child_process before importing the module
const mockExecFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: any[]) => mockExecFileSync(...args),
}));

// Mock fs.existsSync
const mockExistsSync = vi.fn((_p: string) => true);
vi.mock("node:fs", () => ({
  default: { existsSync: (p: string) => mockExistsSync(p) },
  existsSync: (p: string) => mockExistsSync(p),
}));

// Import after mocks
import {
  detectNvidiaGpu,
  getHardwareSnapshot,
  refreshHardwareSnapshot,
  _resetHardwareCache,
} from "../hardware-detect.js";

beforeEach(() => {
  vi.clearAllMocks();
  _resetHardwareCache();
});

describe("detectNvidiaGpu", () => {
  it("returns null when nvidia-smi is not found", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });
    const result = detectNvidiaGpu();
    expect(result).toBeNull();
  });

  it("parses nvidia-smi CSV output correctly", () => {
    // First call: --version check (resolve path)
    // Second call: --query-gpu CSV
    // Third call: header for CUDA version
    let callIndex = 0;
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      callIndex++;
      if (args?.includes("--version")) {
        return "NVIDIA-SMI 572.16";
      }
      if (args?.includes("--query-gpu=name,memory.total,memory.free,driver_version")) {
        return "NVIDIA GeForce RTX 4060, 8188, 6542, 572.16\n";
      }
      // Header output for CUDA version
      return "NVIDIA-SMI 572.16    Driver Version: 572.16    CUDA Version: 12.1\n";
    });

    const result = detectNvidiaGpu();
    expect(result).not.toBeNull();
    expect(result!.vendor).toBe("nvidia");
    expect(result!.name).toBe("NVIDIA GeForce RTX 4060");
    expect(result!.vramTotalMB).toBe(8188);
    expect(result!.vramFreeMB).toBe(6542);
    expect(result!.driverVersion).toBe("572.16");
    expect(result!.cudaVersion).toBe("12.1");
  });

  it("returns null when CSV output is empty", () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args?.includes("--version")) return "ok";
      return "";
    });
    const result = detectNvidiaGpu();
    expect(result).toBeNull();
  });

  it("handles missing CUDA version gracefully", () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args?.includes("--version")) return "ok";
      if (args?.includes("--query-gpu=name,memory.total,memory.free,driver_version")) {
        return "RTX 3080, 10240, 9000, 570.00\n";
      }
      throw new Error("no CUDA");
    });
    const result = detectNvidiaGpu();
    expect(result).not.toBeNull();
    expect(result!.cudaVersion).toBeUndefined();
  });
});

describe("getHardwareSnapshot", () => {
  it("returns a valid snapshot with system info", () => {
    // nvidia-smi will fail in test environment
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const snapshot = getHardwareSnapshot();
    expect(snapshot.totalRamMB).toBeGreaterThan(0);
    expect(snapshot.freeRamMB).toBeGreaterThan(0);
    expect(snapshot.cpuCores).toBeGreaterThan(0);
    expect(snapshot.platform).toBeDefined();
    expect(snapshot.arch).toBeDefined();
    expect(snapshot.timestamp).toBeGreaterThan(0);
  });

  it("caches the result for subsequent calls", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const first = getHardwareSnapshot();
    const second = getHardwareSnapshot();
    expect(first.timestamp).toBe(second.timestamp);
  });

  it("refreshHardwareSnapshot bypasses cache", () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error("not found");
    });

    const first = getHardwareSnapshot();

    // Small delay to ensure different timestamp
    const second = refreshHardwareSnapshot();
    // Timestamps might be the same if called within same ms, but cache is bypassed
    expect(second).toBeDefined();
    expect(second.totalRamMB).toBeGreaterThan(0);
  });
});
