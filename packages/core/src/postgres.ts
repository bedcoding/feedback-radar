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

function identifier(value: string, name: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${name}에는 영문자, 숫자, 밑줄만 사용할 수 있습니다.`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${identifier(value, 'PostgreSQL 식별자')}"`;
}

/** 접속 정보를 항목별로 적던 시절의 변수들. 남아 있으면 안내만 하고 값은 쓰지 않는다 */
const LEGACY_KEYS = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
let legacyWarningShown = false;

/**
 * 항목별 변수만 남은 설정에서 조용히 SQLite로 떨어지지 않게 한 번 알린다.
 *
 * 이 경고가 없으면 화면은 정상으로 보이는데 데이터만 로컬 DB에서 온다. 접속 실패보다
 * 알아채기 어려운 상태라 명시적으로 말해 준다.
 */
function warnLegacyKeys(): void {
  if (legacyWarningShown) return;
  const found = LEGACY_KEYS.filter((k) => process.env[k]?.trim());
  if (!found.length) return;
  legacyWarningShown = true;
  console.warn(
    `[DB] ${found.join(', ')}는 더 이상 읽지 않습니다. 접속 정보는 DATABASE_URL 한 줄로 적습니다:\n` +
      '     DATABASE_URL=postgresql://사용자:비밀번호@호스트:5432/DB이름?sslmode=require',
  );
}

/**
 * PostgreSQL을 쓰는지 판정한다.
 *
 * DATABASE_DRIVER를 적어 뒀으면 그 값이 이긴다(sqlite라고 적어 두고 접속 문자열만 남겨 둔
 * 상태에서 의도치 않게 원격 DB를 건드리는 일을 막는다). 비워 뒀으면 DATABASE_URL 유무로 정한다.
 */
export function postgresConfigured(): boolean {
  const driver = process.env.DATABASE_DRIVER?.trim().toLowerCase();
  const hasUrl = Boolean(process.env.DATABASE_URL?.trim());
  if (!hasUrl) warnLegacyKeys();
  if (driver) return driver === 'postgres';
  return hasUrl;
}

/** libpq 표준 sslmode를 이 코드가 다루는 네 가지로 좁힌다 */
function normalizeSslMode(raw: string, source: string): PostgresSettings['sslMode'] {
  const v = raw.trim().toLowerCase();
  if (v === 'disable' || v === 'auto' || v === 'require' || v === 'verify-full') return v;
  // allow, prefer는 "가능하면 TLS"라 실패 시 평문으로 떨어진다. 여기서는 평문(auto)으로 취급한다.
  if (v === 'allow' || v === 'prefer') return 'auto';
  if (v === 'verify-ca') return 'verify-full';
  throw new Error(`${source}는 disable, auto, require, verify-full 중 하나여야 합니다 (받은 값: ${raw}).`);
}

function parsePort(raw: string | undefined, source: string): number {
  const port = Number(raw || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${source}가 올바르지 않습니다.`);
  }
  return port;
}

function parsePoolMax(raw: string | undefined, source: string): number {
  const poolMax = Number(raw || 1);
  if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 10) {
    throw new Error(`${source}는 1~10 사이의 정수여야 합니다.`);
  }
  return poolMax;
}

/**
 * `postgresql://user:pass@host:5432/dbname?sslmode=require&schema=feedback_radar` 한 줄을 푼다.
 *
 * 스키마, sslmode, 풀 크기는 URL 쿼리에 없으면 PGSCHEMA, PGSSL_MODE, PGPOOL_MAX를,
 * 그것도 없으면 기본값을 쓴다. 접속 정보 자체는 이 URL에서만 온다.
 *
 * 사용자명과 비밀번호는 percent-decode한다. 비밀번호에 `#`이 들어 있으면 URL 문법상 그 뒤가
 * fragment로 잘리므로 `%23`으로 적어야 한다(.env 파서도 따옴표 없는 `#`을 주석으로 자른다).
 */
function settingsFromUrl(raw: string): PostgresSettings {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      'DATABASE_URL을 해석할 수 없습니다. postgresql://사용자:비밀번호@호스트:5432/DB이름 형식이어야 하고, ' +
        '비밀번호의 #, /, ?는 %23, %2F, %3F로 적어야 합니다.',
    );
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`DATABASE_URL은 postgresql://로 시작해야 합니다 (받은 값: ${url.protocol}//...).`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL에 DB 이름이 없습니다 (호스트 뒤에 /DB이름).');
  if (!url.hostname) throw new Error('DATABASE_URL에 호스트가 없습니다.');
  if (!url.username) throw new Error('DATABASE_URL에 사용자명이 없습니다.');

  const q = url.searchParams;
  const sslRaw = q.get('sslmode') ?? process.env.PGSSL_MODE;
  return {
    host: url.hostname,
    port: parsePort(url.port, 'DATABASE_URL의 포트'),
    database,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    schema: identifier(
      q.get('schema')?.trim() || process.env.PGSCHEMA?.trim() || DEFAULT_SCHEMA,
      'schema',
    ),
    sslMode: normalizeSslMode(sslRaw || 'require', sslRaw ? 'sslmode' : 'PGSSL_MODE'),
    poolMax: parsePoolMax(q.get('pool_max') ?? process.env.PGPOOL_MAX, 'pool_max'),
  };
}

/**
 * 접속 정보를 환경변수에서 읽는다. 입력은 DATABASE_URL 한 줄뿐이다.
 *
 * 항목별 변수(PGHOST 등)를 받던 경로는 없앴다. 배포 환경에 같은 값을 아홉 번 등록하는 것이
 * 번거롭고, 두 방식이 공존하면 어느 쪽이 실제로 쓰였는지 추적하기 어렵다.
 * 부가 설정 세 개(PGSCHEMA, PGSSL_MODE, PGPOOL_MAX)는 URL 쿼리에 없을 때만 보충용으로 읽는다.
 */
export function postgresSettingsFromEnv(): PostgresSettings {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    warnLegacyKeys();
    throw new Error(
      'DATABASE_URL이 설정되지 않았습니다. 레포 루트 .env에 한 줄로 적으세요:\n' +
        '  DATABASE_URL=postgresql://사용자:비밀번호@호스트:5432/DB이름?sslmode=require',
    );
  }
  return settingsFromUrl(url);
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
