// 1. Fixed Window Counter — "The Every-Hour Reset"

// Imagine a movie ticket counter that says "only 5 tickets per hour." At exactly 10:00 it resets the counter to zero, no matter what happened before.

// Here's the catch — and this is the classic gotcha you need to get before the code makes sense: if 5 people rush in at 9:59,
// and then 5 more rush in at 10:01 (right after reset), that's 10 people served in 2 minutes, even though the "rate" was supposed to be 5/hour.
// The bouncer isn't smart about the boundary — he just cares "did the clock tick over to a new hour or not."

// That's why in the code you'll see a windowStart timestamp and a count — he's literally just checking "has enough time passed to reset my clipboard to zero?"

/** ****************************************************************
 * Fixed Window → dumb clock-based counter, has an edge-burst flaw
 * **************************************************************** */

const limits = new Map();
//userId: {count: no_of_requests, windowStart: firstTimeStampOfTheWindow}

function fixedWindowRateLimiter(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = limits.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    limits.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count < maxRequests) {
    entry.count++;
    return true;
  }

  return false;
}
