// ============================================================
// CN Adapter Logger — 统一日志前缀
// ============================================================

export type CnLogger = {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

/**
 * 创建带统一前缀的日志器。
 *
 * @param subsystem - 子系统名称
 * @returns CnLogger 实例
 *
 * @example
 * const log = createCnLogger("config");
 * log.info("migration complete"); // 输出: [cn-adapter:config] migration complete
 */
export function createCnLogger(subsystem: string): CnLogger {
  const prefix = `[cn-adapter:${subsystem}]`;
  return {
    debug: (msg: string) => console.debug(`${prefix} ${msg}`),
    info: (msg: string) => console.info(`${prefix} ${msg}`),
    warn: (msg: string) => console.warn(`${prefix} ${msg}`),
    error: (msg: string) => console.error(`${prefix} ${msg}`),
  };
}
