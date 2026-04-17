// apps/web/src/lib/rate-limit.ts
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

class MemoryStore {
  private hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    let timestamps = this.hits.get(key) || [];
    timestamps = timestamps.filter(t => t > windowStart);
    
    if (timestamps.length >= limit) {
      return {
        success: false,
        limit,
        remaining: 0,
        reset: timestamps[0] + windowMs
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    // Simple cleanup: if map gets too large, prune it
    if (this.hits.size > 1000) {
      for (const [k, v] of this.hits.entries()) {
        if (v.every(t => t <= now - windowMs)) {
          this.hits.delete(k);
        }
      }
    }

    return {
      success: true,
      limit,
      remaining: limit - timestamps.length,
      reset: now + windowMs
    };
  }

  clear() {
    this.hits.clear();
  }
}

export const rateLimit = new MemoryStore();
