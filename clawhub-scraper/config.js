import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(__dirname, '.env') });

export const config = {
  baseUrl: process.env.CLAWHUB_BASE_URL || 'https://clawhub.ai/api/v1',
  concurrency: parseInt(process.env.CONCURRENCY || '10', 10),
  rateLimitMs: parseInt(process.env.RATE_LIMIT_MS || '200', 10),
  batchSize: parseInt(process.env.BATCH_SIZE || '50', 10),
  dbPath: resolve(__dirname, process.env.DB_PATH || './data/clawhub.db'),
  outputDir: resolve(__dirname, process.env.OUTPUT_DIR || './output'),
  retryMaxAttempts: 5,
  retryBaseDelayMs: 5000,
  listingLimit: 100,
};
