// 3. Sliding Window Counter — "The Smart Estimator"

// This bouncer is the practical middle ground. He doesn't keep a full notebook, but he keeps two numbers: "how many came in the previous hour block"
// and "how many have come in this hour block so far."

// Now here's his clever trick — if we're 25% into the current hour, he assumes only 75% of last hour's crowd would still "count"
// if you slid the window back. So he does a weighted guess: (previous hour's count × 75%) + (this hour's count so far).

// It's not perfectly exact like the notebook guy, but it's very close, and way cheaper — just two numbers instead of a giant list.
// This is the "good enough for 99% of real systems" approach.

/** ****************************************************************
 * Sliding Counter → smart approximate math version of the log
 * **************************************************************** */

const buckets = new Map();
//{key: {window: window_number, prev: previous_window_count, curr: current_window_count}}

function slidingWindowCounterRateLimiter(key, maxRequests, windowMs) {
  const now = Date.now();
  const currentWindow = Math.floor(now / windowMs);

  const entry = buckets.get(key) || { window: currentWindow, prev: 0, curr: 0 };

  if (entry.window !== currentWindow) {
    entry.prev = entry.window === currentWindow - 1 ? entry.curr : 0;
    entry.curr = 1;
    entry.window = currentWindow;
  }

  const elapsed = now % windowMs;
  const weight = (windowMs - elapsed) / windowMs;

  const estimatedCount = entry.prev * weight + entry.curr;

  if (estimatedCount < maxRequests) {
    entry.curr++;
    buckets.set(key, entry);
    return true;
  }

  buckets.set(key, entry);
  return false;
}
