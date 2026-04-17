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
    // Filter out old timestamps
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

    return {
      success: true,
      limit,
      remaining: limit - timestamps.length,
      reset: now + windowMs
    };
  }
}

export const rateLimit = new MemoryStore();
