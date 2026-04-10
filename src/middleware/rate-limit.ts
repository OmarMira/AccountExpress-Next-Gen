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
  // REASON: Elysia Context types are complex internal generics not easily narrowed without importing internal types
  return async ({ request, set }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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

const globalStore = new Map<string, RateLimitInfo>();

/**
 * Global rate limiter for the entire API.
 * 100 requests per IP per minute.
 */
export const globalRateLimiter = (max: number, windowMs: number) => {
  // REASON: Elysia Context types are complex internal generics not easily narrowed without importing internal types
  return async ({ request, set }: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    const now = Date.now();
    
    let info = globalStore.get(ip);
    
    if (info && now > info.resetAt) {
      globalStore.delete(ip);
      info = undefined;
    }

    if (!info) {
      info = { count: 1, resetAt: now + windowMs };
      globalStore.set(ip, info);
      return;
    }
    
    if (info.count >= max) {
      set.status = 429;
      set.headers['Retry-After'] = "60";
      return { 
        error: "Too many requests",
        retryAfter: 60
      };
    }
    
    info.count++;
  };
};

// Cleanup globalStore
setInterval(() => {
  const now = Date.now();
  for (const [ip, info] of globalStore.entries()) {
    if (now > info.resetAt) {
      globalStore.delete(ip);
    }
  }
}, 5 * 60 * 1000);
