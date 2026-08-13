// 4. Token Bucket — "The Coupon Dispenser"

// Totally different mental model now. Picture a bucket that automatically drops in one coin every, say,
// 2 seconds — up to a max of, say, 10 coins in the bucket. Every time a customer wants to enter, they must hand over one coin.
// No coins in the bucket = sorry, wait.

// The beautiful part: if nobody's shown up for a while, the bucket fills up to 10. Then if a burst of 10 people suddenly arrives,
// they can all get in immediately, using up the saved coins — because the bucket rewards good, quiet behavior with burst capacity later.
// But once the bucket's empty, you're limited to the slow trickle-in refill rate.

// This is why it's the industry favorite (Stripe, AWS use it) — it's realistic. Real traffic isn't smooth; it comes in bursts,
// and this algorithm tolerates that gracefully while still capping the long-term average.

/** ****************************************************************
 * Token Bucket → allows bursts, refills over time (bursty-friendly)
 * Pros: Most popular in production (AWS, Stripe, etc.) — handles bursty traffic gracefully while capping average throughput.
 * Cons: Slightly more complex to reason about; needs tuning of capacity vs. refill rate.
 * **************************************************************** */

const buckets = new Map();
//{key: {tokens: number, lastRefill: timestamp}}

function tokenBucket(key, capacity, refillRatePerSec) {
  const now = Date.now();
  const entry = buckets.get(key) || { tokens: capacity, lastRefill: now };

  const elapsedSec = (now - entry.lastRefill) / 1000;
  entry.tokens = Math.min(
    capacity,
    entry.tokens + elapsedSec * refillRatePerSec,
  );

  if (entry.tokens > 0) {
    entry.tokens--;
    entry.lastRefill = now;
    return true;
  }

  buckets.set(key, entry);
  return false;
}
