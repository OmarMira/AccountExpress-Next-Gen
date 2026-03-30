// ============================================================
// SIMPLE MEMORY-BASED RATE LIMITER MIDDLEWARE
// Prevents brute-force attacks by limiting attempts per IP
// ============================================================

interface RateLimitInfo {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitInfo>();

/**
 * Creates a rate limiter for a specific route.
 * @param max Max attempts allowed within the window.
 * @param windowMs Time window in milliseconds.
 */
export const loginRateLimiter = (max: number, windowMs: number) => {
  return async ({ request, set }: any) => {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    
    let info = memoryStore.get(ip);
    
    // Cleanup if window expired
    if (info && now > info.resetAt) {
      memoryStore.delete(ip);
      info = undefined;
    }

    if (!info) {
      info = { count: 1, resetAt: now + windowMs };
      memoryStore.set(ip, info);
      return;
    }
    
    if (info.count >= max) {
      set.status = 429;
      set.headers['Retry-After'] = Math.ceil((info.resetAt - now) / 1000).toString();
      return { 
        error: "Too many login attempts from this IP. Please try again later.",
        retryAfterSeconds: Math.ceil((info.resetAt - now) / 1000)
      };
    }
    
    info.count++;
  };
};

// Cleanup expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, info] of memoryStore.entries()) {
    if (now > info.resetAt) {
      memoryStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);
