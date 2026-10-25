/**
 * Metabase prod read database client.
 *
 * Executes read-only native SQL queries against XPAT's internal Metabase
 * instance using X-API-Key authentication.
 *
 * Database: prod read database (ID: 2) — MySQL 8.0
 * Base URL: METABASE_URL env var (https://metabase-internal.xpat.money)
 * Auth:     X-API-Key header with METABASE_API_KEY env var
 *
 * All queries are read-only SELECT statements. No writes, no mutations.
 */

const METABASE_DATABASE_ID = 2; // prod read database

export interface MetabaseRow {
  [key: string]: string | number | boolean | null;
}

export interface MetabaseQueryResult {
  rows: MetabaseRow[];
  columns: string[];
  rowCount: number;
  error: string | null;
}

/**
 * Executes a native SQL query against the Metabase prod read database.
 * Returns structured rows with column names as keys.
 *
 * @param sql     - The SQL SELECT statement to execute. Must be read-only.
 * @param params  - Optional named parameters for the query (unused for now — kept for future use).
 */
export async function runMetabaseQuery(
  sql: string,
  _params: Record<string, unknown> = {},
): Promise<MetabaseQueryResult> {
  const baseUrl = process.env.METABASE_URL;
  const apiKey = process.env.METABASE_API_KEY;

  if (!baseUrl || !apiKey) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: "METABASE_URL or METABASE_API_KEY is not configured.",
    };
  }

  // Safety guard — only allow SELECT statements
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: "Only SELECT queries are permitted.",
    };
  }

  const endpoint = `${baseUrl}/api/dataset`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        database: METABASE_DATABASE_ID,
        type: "native",
        native: {
          query: sql,
        },
      }),
    });
  } catch (err) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: `Metabase API returned HTTP ${response.status}: ${body.slice(0, 300)}`,
    };
  }

  let json: {
    data?: {
      cols?: Array<{ name: string }>;
      rows?: Array<Array<string | number | boolean | null>>;
    };
    error?: string;
    error_type?: string;
  };

  try {
    json = await response.json();
  } catch {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: "Metabase returned non-JSON response.",
    };
  }

  if (json.error) {
    return {
      rows: [],
      columns: [],
      rowCount: 0,
      error: json.error,
    };
  }

  const cols = (json.data?.cols ?? []).map((col) => col.name);
  const rawRows = json.data?.rows ?? [];

  // Convert array-of-arrays to array-of-objects keyed by column name
  const rows: MetabaseRow[] = rawRows.map((row) => {
    const obj: MetabaseRow = {};
    cols.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return obj;
  });

  return {
    rows,
    columns: cols,
    rowCount: rows.length,
    error: null,
  };
}

/**
 * Returns true if Metabase credentials are configured.
 * Used to show connector-needed state in the agent when not configured.
 */
export function hasMetabaseCredentials(): boolean {
  return Boolean(process.env.METABASE_URL && process.env.METABASE_API_KEY);
}
