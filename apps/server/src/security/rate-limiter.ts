interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter {
  readonly #buckets = new Map<string, Bucket>();

  consume(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
    const bucket = this.#buckets.get(key);
    if (bucket === undefined || bucket.resetAt <= now) {
      this.#buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  sweep(now = Date.now()): void {
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) this.#buckets.delete(key);
    }
  }

  clear(): void {
    this.#buckets.clear();
  }
}
