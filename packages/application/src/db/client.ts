export interface DbRow {
  [key: string]: unknown;
}

export interface AppDbClient {
  query<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends DbRow = DbRow>(sql: string, params?: unknown[]): Promise<T | null>;
  execute(sql: string, params?: unknown[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: (tx: AppDbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
