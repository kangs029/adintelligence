/**
 * Mindcase Reddit Posts API client.
 *
 * Wraps the Mindcase REST API endpoint for Reddit post extraction.
 * Mindcase provides compliant access to Reddit data without requiring
 * a Reddit developer application or OAuth credentials.
 *
 * API docs: https://www.mindcase.co/api/reddit/posts
 * Endpoint: POST https://api.mindcase.co/v1/data/reddit/posts/run?wait=true
 * Auth:     Bearer mk_live_{MINDCASE_API_KEY}
 * Cost:     0.01¢ per result
 */

export const MINDCASE_POSTS_URL =
  "https://api.mindcase.co/v1/data/reddit/posts/run?wait=true";

/**
 * Fetches Reddit posts from Mindcase for a single subreddit + keyword combination.
 *
 * @param {object} opts
 * @param {string}   opts.apiKey      - Mindcase API key (mk_live_...)
 * @param {string}   opts.subreddit   - Subreddit name without r/ prefix, e.g. "nri"
 * @param {string}   opts.keyword     - Search keyword, e.g. "send money to india"
 * @param {string}   [opts.sortBy]    - "new" | "hot" | "top" | "rising" (default: "new")
 * @param {string}   [opts.timeRange] - "hour"|"day"|"week"|"month"|"year"|"all" (default: "day")
 * @param {number}   [opts.maxResults] - Max posts to fetch and be charged for per call (default: 25)
 * @param {Function} [opts.fetchImpl] - fetch implementation (injectable for tests)
 *
 * @returns {Promise<{ rows: object[], error: object|null }>}
 */
export async function fetchMindcasePosts({
  apiKey,
  subreddit,
  keyword,
  sortBy = "new",
  timeRange = "day",
  maxResults = 25,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    return {
      error: {
        message: "MINDCASE_API_KEY is not configured.",
        subreddit,
        keyword,
      },
      rows: [],
    };
  }

  const subredditUrl = `https://www.reddit.com/r/${subreddit}/`;

  let response;
  try {
    response = await fetchImpl(MINDCASE_POSTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        params: {
          urls: subredditUrl,
          keyword,
          sortBy,
          timeRange,
          maxResults,
        },
      }),
    });
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : String(err),
        subreddit,
        keyword,
      },
      rows: [],
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      error: {
        message: `Mindcase API returned HTTP ${response.status}.`,
        body: body.slice(0, 500),
        subreddit,
        keyword,
        status: response.status,
      },
      rows: [],
    };
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    return {
      error: {
        message: "Mindcase API returned non-JSON response.",
        subreddit,
        keyword,
      },
      rows: [],
    };
  }

  // Mindcase returns results in a "results" or "data" array depending on run mode.
  // With ?wait=true the response contains the rows directly.
  const rows = json?.results ?? json?.data ?? json?.rows ?? [];

  if (!Array.isArray(rows)) {
    return {
      error: {
        message: "Mindcase API response did not contain a results array.",
        subreddit,
        keyword,
      },
      rows: [],
    };
  }

  return { error: null, rows };
}
