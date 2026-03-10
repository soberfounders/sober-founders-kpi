interface Bucket {
  count: number;
  resetAt: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly windowMs: number, private readonly maxRequests: number) {}

  public tryConsume(key: string): boolean {
    const current = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= current) {
      this.buckets.set(key, { count: 1, resetAt: current + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxRequests) {
      return false;
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
