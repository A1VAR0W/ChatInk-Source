import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { databaseMigrations } from './migrations.js';

export class Database {
  readonly #pool: Pool;

  constructor(connectionString: string) {
    this.#pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'chatink-server',
    });
  }

  async initialize(): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', ['chatink_database_migrations']);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      for (const migration of databaseMigrations) {
        const applied = await client.query<{ id: string }>('SELECT id FROM schema_migrations WHERE id = $1', [migration.id]);
        if (applied.rowCount !== 0) continue;
        await this.#applyMigration(client, migration.id, migration.sql);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', ['chatink_database_migrations']).catch(() => undefined);
      client.release();
    }
  }

  async query<Row extends QueryResultRow>(text: string, values: readonly unknown[] = []) {
    return this.#pool.query<Row>(text, [...values]);
  }

  async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ping(): Promise<void> {
    await this.#pool.query('SELECT 1');
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async #applyMigration(client: PoolClient, id: string, sql: string): Promise<void> {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
