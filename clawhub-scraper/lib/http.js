// ─── HTTP utilities: retry, concurrency pool ───

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch with auto-retry on 429 / network errors
 */
export async function fetchRetry(url, opts = {}, maxRetries = 5, baseDelay = 3000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), ...opts });
      if (res.status === 429) {
        const delay = baseDelay * Math.pow(2, attempt);
        const retryAfter = res.headers.get('retry-after');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : delay;
        process.stderr.write(`\n  ⏳ 429 rate-limited, wait ${(wait / 1000).toFixed(0)}s (${attempt + 1}/${maxRetries + 1})\n`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 500 && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        process.stderr.write(`\n  ⚠️ ${res.status} server error, retry in ${(delay / 1000).toFixed(0)}s\n`);
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      process.stderr.write(`\n  ⚠️ ${err.message}, retry in ${(delay / 1000).toFixed(0)}s\n`);
      await sleep(delay);
    }
  }
}

/**
 * Concurrency pool: run N async tasks in parallel with rate limit
 */
export async function pool(items, concurrency, intervalMs, fn, onProgress) {
  let running = 0;
  let idx = 0;
  let done = 0;
  const total = items.length;
  const errors = [];

  return new Promise((resolve) => {
    function next() {
      while (running < concurrency && idx < total) {
        const item = items[idx++];
        running++;

        fn(item)
          .catch((err) => errors.push({ item, err }))
          .finally(() => {
            running--;
            done++;
            if (onProgress) onProgress(done, total, errors.length);
            // stagger next batch
            if (idx < total) setTimeout(next, intervalMs);
            else if (running === 0) resolve({ done, errors });
          });
      }
      if (total === 0) resolve({ done: 0, errors: [] });
    }
    next();
  });
}
