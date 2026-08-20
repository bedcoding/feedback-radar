import { Pool, type PoolConfig } from 'pg';

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

function identifier(value: string, name: string): string {
  if (!IDENTIFIER.test(value)) {
    throw new Error(`${name}에는 영문자, 숫자, 밑줄만 사용할 수 있습니다.`);
  }
  return value;
}

function quoteIdentifier(value: string): string {
  return `"${identifier(value, 'PostgreSQL 식별자')}"`;
}

/**
 * 예전 설정 방식의 변수들. 남아 있으면 안내만 하고 값은 쓰지 않는다.
 *
 * DATABASE_DRIVER도 여기 있다. 저장소가 PostgreSQL 하나뿐이라 고를 것이 없어졌는데,
 * 그대로 두면 `sqlite`라고 적어 로컬 DB로 되돌릴 수 있다는 오해를 준다.
 */
const LEGACY_KEYS = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'DATABASE_DRIVER'];
let legacyWarningShown = false;

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

/** 접속 정보가 있는지. 저장소는 PostgreSQL 하나뿐이라 이 값 하나로 정해진다 */
export function postgresConfigured(): boolean {
  warnLegacyKeys();
  return Boolean(process.env.DATABASE_URL?.trim());
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
        lang TEXT,
        tagged_at TEXT,
        UNIQUE(source, source_id)
      )
    `);
    /**
     * 이미 만들어진 표에는 CREATE TABLE IF NOT EXISTS 가 아무 일도 하지 않는다.
     * 컬럼을 새로 넣을 때는 ADD COLUMN IF NOT EXISTS 를 따로 돌려야 기존 설치본에도 붙는다.
     * 이 목록은 계속 늘어날 수 있으므로 한 자리에 모아 둔다.
     */
    for (const [column, type] of [['lang', 'TEXT']] as const) {
      await client.query(`ALTER TABLE ${q}.items ADD COLUMN IF NOT EXISTS ${column} ${type}`);
    }
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
