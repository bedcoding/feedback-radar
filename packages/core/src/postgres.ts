import Database from 'better-sqlite3';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { defaultDbPath } from './paths.js';

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;
const DEFAULT_SCHEMA = 'feedback_radar';
let schemaReady = false;
let schemaInit: Promise<void> | undefined;
let insecureWarningShown = false;

export interface PostgresSettings {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema: string;
  sslMode: 'disable' | 'auto' | 'require' | 'verify-full';
  poolMax: number;
}

export interface PostgresDb {
  kind: 'postgres';
  pool: Pool;
  schema: string;
  readOnly: boolean;
}

export interface PostgresMigrationResult {
  schema: string;
  sqlitePath: string;
  before: Record<string, number>;
  after: Record<string, number>;
  databaseBytes: number;
  schemaBytes: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}가 설정되지 않았습니다.`);
  return value;
}

function identifier(value: string, name: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${name}에는 영문자, 숫자, 밑줄만 사용할 수 있습니다.`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${identifier(value, 'PostgreSQL 식별자')}"`;
}

export function postgresConfigured(): boolean {
  return process.env.DATABASE_DRIVER?.trim().toLowerCase() === 'postgres';
}

export function postgresSettingsFromEnv(): PostgresSettings {
  const sslRaw = (process.env.PGSSL_MODE || 'require').trim().toLowerCase();
  if (!['disable', 'auto', 'require', 'verify-full'].includes(sslRaw)) {
    throw new Error('PGSSL_MODE는 disable, auto, require, verify-full 중 하나여야 합니다.');
  }
  const port = Number(process.env.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PGPORT가 올바르지 않습니다.');
  }
  const poolMax = Number(process.env.PGPOOL_MAX || 1);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 10) {
    throw new Error('PGPOOL_MAX는 1~10 사이의 정수여야 합니다.');
  }
  return {
    host: required('PGHOST'),
    port,
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
    schema: identifier(process.env.PGSCHEMA?.trim() || DEFAULT_SCHEMA, 'PGSCHEMA'),
    sslMode: sslRaw as PostgresSettings['sslMode'],
    poolMax,
  };
}

function poolConfig(settings: PostgresSettings): PoolConfig {
  const ssl =
    settings.sslMode === 'disable' || settings.sslMode === 'auto'
      ? false
      : { rejectUnauthorized: settings.sslMode === 'verify-full' };
  return {
    host: settings.host,
    port: settings.port,
    database: settings.database,
    user: settings.user,
    password: settings.password,
    ssl,
    max: settings.poolMax,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    application_name: 'feedback-radar',
  };
}

export function createPostgresPool(settings = postgresSettingsFromEnv()): Pool {
  if (!insecureWarningShown && (settings.sslMode === 'disable' || settings.sslMode === 'auto')) {
    insecureWarningShown = true;
    console.warn('[DB] PostgreSQL TLS가 꺼져 있습니다. 단기 데모 외에는 암호화 연결을 사용하세요.');
  }
  return new Pool(poolConfig(settings));
}

export async function ensurePostgresSchema(
  pool: Pool,
  schema = postgresSettingsFromEnv().schema,
): Promise<void> {
  const q = quoteIdentifier(schema);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${q}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q}.items (
        id BIGSERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        source_id TEXT NOT NULL,
        url TEXT,
        author TEXT,
        content TEXT NOT NULL,
        rating INTEGER,
        posted_at TEXT,
        collected_at TEXT NOT NULL,
        keyword TEXT,
        service TEXT,
        country TEXT,
        sentiment TEXT,
        category TEXT,
        severity TEXT,
        team TEXT,
        summary TEXT,
        relevant SMALLINT,
        reason TEXT,
        tagged_at TEXT,
        UNIQUE(source, source_id)
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_items_collected ON ${q}.items(collected_at)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_items_category ON ${q}.items(category)`,
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_service ON ${q}.items(service)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_items_posted ON ${q}.items(posted_at)`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q}.settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q}.channel_summaries (
        date TEXT NOT NULL,
        source TEXT NOT NULL,
        service TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT '',
        total INTEGER NOT NULL,
        negative INTEGER NOT NULL,
        urgent INTEGER NOT NULL,
        bullets TEXT NOT NULL,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cost_usd DOUBLE PRECISION,
        created_at TEXT NOT NULL,
        PRIMARY KEY (date, source, service, country)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q}.collect_progress (
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        service TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        country TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL,
        collected INTEGER,
        inserted INTEGER,
        note TEXT,
        started_at TEXT,
        ended_at TEXT,
        PRIMARY KEY (run_id, seq)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${q}.schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await client.query(
      `INSERT INTO ${q}.schema_meta (key, value) VALUES ('schema_version', '1')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function openPostgresDb(options: { readOnly?: boolean } = {}): Promise<PostgresDb> {
  const settings = postgresSettingsFromEnv();
  const pool = createPostgresPool(settings);
  try {
    await pool.query('SELECT 1');
    if (!options.readOnly && !schemaReady) {
      schemaInit ??= ensurePostgresSchema(pool, settings.schema)
        .then(() => { schemaReady = true; })
        .finally(() => { schemaInit = undefined; });
      await schemaInit;
    }
    return {
      kind: 'postgres',
      pool,
      schema: settings.schema,
      readOnly: Boolean(options.readOnly),
    };
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

type SqliteRow = Record<string, unknown>;

async function upsertRows(
  client: PoolClient,
  schema: string,
  table: string,
  columns: string[],
  rows: SqliteRow[],
  conflict: string,
  updateColumns: string[],
): Promise<void> {
  if (rows.length === 0) return;
  const qSchema = quoteIdentifier(schema);
  const qTable = quoteIdentifier(table);
  const quotedColumns = columns.map(quoteIdentifier);
  const batchSize = Math.max(1, Math.floor(8_000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const update = updateColumns
      .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
      .join(', ');
    await client.query(
      `INSERT INTO ${qSchema}.${qTable} (${quotedColumns.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT ${conflict} DO UPDATE SET ${update}`,
      values,
    );
  }
}

async function tableCounts(client: PoolClient, schema: string): Promise<Record<string, number>> {
  const q = quoteIdentifier(schema);
  const tables = ['items', 'settings', 'channel_summaries', 'collect_progress'];
  const result: Record<string, number> = {};
  for (const table of tables) {
    const row = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ${q}.${quoteIdentifier(table)}`,
    );
    result[table] = Number(row.rows[0]?.count ?? 0);
  }
  return result;
}

export async function migrateSqliteToPostgres(
  sqlitePath = defaultDbPath(),
): Promise<PostgresMigrationResult> {
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const settings = postgresSettingsFromEnv();
  const pool = createPostgresPool(settings);
  try {
    await ensurePostgresSchema(pool, settings.schema);
    const client = await pool.connect();
    try {
      const before = await tableCounts(client, settings.schema);
      const items = sqlite.prepare('SELECT * FROM items ORDER BY id').all() as SqliteRow[];
      const appSettings = sqlite.prepare('SELECT * FROM settings ORDER BY key').all() as SqliteRow[];
      const summaries = sqlite
        .prepare('SELECT * FROM channel_summaries ORDER BY date, source, service, country')
        .all() as SqliteRow[];
      const progress = sqlite
        .prepare('SELECT * FROM collect_progress ORDER BY run_id, seq')
        .all() as SqliteRow[];

      await client.query('BEGIN');
      await upsertRows(
        client,
        settings.schema,
        'items',
        [
          'id', 'source', 'source_id', 'url', 'author', 'content', 'rating', 'posted_at',
          'collected_at', 'keyword', 'service', 'country', 'sentiment', 'category', 'severity',
          'team', 'summary', 'relevant', 'reason', 'tagged_at',
        ],
        items,
        '(source, source_id)',
        [
          'url', 'author', 'content', 'rating', 'posted_at', 'collected_at', 'keyword',
          'service', 'country', 'sentiment', 'category', 'severity', 'team', 'summary',
          'relevant', 'reason', 'tagged_at',
        ],
      );
      await upsertRows(
        client,
        settings.schema,
        'settings',
        ['key', 'value'],
        appSettings,
        '(key)',
        ['value'],
      );
      await upsertRows(
        client,
        settings.schema,
        'channel_summaries',
        [
          'date', 'source', 'service', 'country', 'total', 'negative', 'urgent', 'bullets',
          'model', 'input_tokens', 'output_tokens', 'cost_usd', 'created_at',
        ],
        summaries,
        '(date, source, service, country)',
        [
          'total', 'negative', 'urgent', 'bullets', 'model', 'input_tokens', 'output_tokens',
          'cost_usd', 'created_at',
        ],
      );
      await upsertRows(
        client,
        settings.schema,
        'collect_progress',
        [
          'run_id', 'seq', 'service', 'source', 'country', 'state', 'collected', 'inserted',
          'note', 'started_at', 'ended_at',
        ],
        progress,
        '(run_id, seq)',
        [
          'service', 'source', 'country', 'state', 'collected', 'inserted', 'note',
          'started_at', 'ended_at',
        ],
      );
      const q = quoteIdentifier(settings.schema);
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('${settings.schema}.items', 'id'),
           COALESCE((SELECT MAX(id) FROM ${q}.items), 1),
           EXISTS (SELECT 1 FROM ${q}.items)
         )`,
      );
      await client.query(
        `INSERT INTO ${q}.schema_meta (key, value) VALUES ('last_sqlite_migration_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [new Date().toISOString()],
      );
      await client.query('COMMIT');

      const after = await tableCounts(client, settings.schema);
      const size = await client.query<{ database_bytes: string; schema_bytes: string }>(
        `SELECT
           pg_database_size(current_database()) AS database_bytes,
           COALESCE(SUM(
             CASE
               WHEN c.relkind IN ('r', 'm', 'p') THEN pg_total_relation_size(c.oid)
               WHEN c.relkind = 'S' THEN pg_relation_size(c.oid)
               ELSE 0
             END
           ), 0) AS schema_bytes
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = $1`,
        [settings.schema],
      );
      return {
        schema: settings.schema,
        sqlitePath,
        before,
        after,
        databaseBytes: Number(size.rows[0]?.database_bytes ?? 0),
        schemaBytes: Number(size.rows[0]?.schema_bytes ?? 0),
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end().catch(() => {});
  }
}
