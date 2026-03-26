import { Pool, type PoolClient, type QueryResultRow } from "pg";
import type { AppDbClient, DbRow } from "./client.js";

const normalizeSql = (sql: string) => sql.trim();

class PostgresDbClient implements AppDbClient {
  constructor(
    private readonly pool: Pool,
    private readonly client?: PoolClient
  ) {}

  private get executor() {
    return this.client ?? this.pool;
  }

  async query<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.executor.query<T & QueryResultRow>(normalizeSql(sql), params);
    return result.rows;
  }

  async one<T extends DbRow = DbRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowCount: number }> {
    const result = await this.executor.query(normalizeSql(sql), params);
    return { rowCount: result.rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: AppDbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txClient = new PostgresDbClient(this.pool, client);
      const result = await fn(txClient);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (!this.client) {
      await this.pool.end();
    }
  }
}

let database: AppDbClient | null = null;

export const getPostgresDatabase = (): AppDbClient => {
  if (database) {
    return database;
  }

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  }

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10) || 10
  });

  database = new PostgresDbClient(pool);
  return database;
};
