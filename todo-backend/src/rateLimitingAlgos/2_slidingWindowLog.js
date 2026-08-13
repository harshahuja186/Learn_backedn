// 2. Sliding Window Log — "The Bouncer with a Notebook"

// This bouncer is paranoid and precise. Every single person who walks in, he writes down the exact timestamp in his notebook.
// When a new person shows up, he doesn't think in terms of "hours" — he flips back exactly 60 minutes from right now and counts
// everyone written down after that point. If it's less than 5, they're in.

// This is perfectly fair — no edge-case cheating like Fixed Window. But imagine thousands of customers a second — that notebook gets huge,
// and flipping through it every time is slow. That's the tradeoff: total accuracy, but expensive memory/compute.

// In code, that "notebook" is literally an array of timestamps, and "flip back and count" is just filtering out old ones.

/** ****************************************************************
 * Sliding Log → perfectly accurate notebook, but memory-heavy
 * **************************************************************** */

const logs = new Map();
//{key: [timestamp1, timestamp2, timestamp3, ...]}

function slidingWindowLogRateLimiter(key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = (logs.get(key) || []).filter(
    (timestamp) => now - timestamp < windowMs,
  );

  if (timestamps.length < maxRequests) {
    timestamps.push(now);
    logs.set(key, timestamps);
    return true;
  }

  logs.set(key, timestamps); //trimming the old timestamps
  return false;
}
