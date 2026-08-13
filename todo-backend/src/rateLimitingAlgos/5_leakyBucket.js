// 5. Leaky Bucket — "The Funnel"

// Now picture an actual bucket with a small hole in the bottom, water leaking out at a constant drip — say,
// one drop every second, no matter what. New customers are like water poured in from the top.
// If you pour too fast and the bucket overflows, the excess just spills out and is lost (rejected).

// The key difference from Token Bucket: output is always the same steady drip, period.
// It doesn't matter if the bucket was empty or full a moment ago — downstream, requests
// always get processed one at a time, evenly spaced. This is great when you need to protect something fragile
// downstream (like a third-party API with its own strict limit) that genuinely cannot handle bursts, even short ones.

/** ****************************************************************
 * Leaky Bucket → forces a constant smooth output rate (burst-hostile)
 * Leaky Bucket → steady, drip-by-drip output, perfect for fragile APIs
 * Pros: Simple, guaranteed steady throughput; good for protecting downstream services.
 * Cons: Can't handle bursty traffic; needs tuning of drip rate.
 * **************************************************************** */

const buckets = new Map(); // key -> LeakyBucket instance

function checkRateLimit(key, capacity, leakRatePerSec) {
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = new LeakyBucket(capacity, leakRatePerSec);
    buckets.set(key, bucket);
  }

  return bucket.allow();
}

class LeakyBucket {
  constructor(capacity, leakRatePerSec) {
    this.capacity = capacity;
    this.leakRatePerSec = leakRatePerSec;
    this.queue = [];
    this.lastLeak = Date.now();
  }

  leak() {
    const now = Date.now();
    const elapsedSec = (now - this.lastLeak) / 1000;
    const leakedTokens = Math.floor(elapsedSec * this.leakRatePerSec);

    if (leakedTokens > 0) {
      this.queue.splice(0, leakedTokens);
      this.lastLeak = now;
    }
  }

  allow() {
    this.leak();
    if (this.queue.length < this.capacity) {
      this.queue.push(Date.now());
      return true;
    }

    return false;
  }
}
