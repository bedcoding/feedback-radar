import fs from 'node:fs/promises';
import { createPostgresPool, postgresSettingsFromEnv, loadPrivateEnv, isReadOnlyMode } from '@feedback-radar/core';
import type { PoolClient } from 'pg';
import type { CollectionBackend, Saved } from './storage';

// Dedicated tables in the existing database keep API originals out of AI tagging.
export function postgresCollectionBackend(legacyFile: string): CollectionBackend {
  let client: PoolClient;
  let q: string;
  let migrated = false;
  async function write(saved: Saved) {
    const groups = Object.entries(saved.groups).map(([id,g]) => ({id,state:g.state,result:{...g.result,videos:undefined}}));
    const videos = Object.entries(saved.groups).flatMap(([group,g]) => g.result.videos.map((v,position) => ({group,id:v.id,position,data:{...v,comments:undefined}})));
    const comments = Object.entries(saved.groups).flatMap(([group,g]) => g.result.videos.flatMap(v => v.comments.map((c,position) => ({group,video:v.id,id:c.id,position,data:c}))));
    await client.query(`DELETE FROM ${q}.youtube_comments`);
    await client.query(`DELETE FROM ${q}.youtube_videos`);
    await client.query(`DELETE FROM ${q}.youtube_groups`);
    await client.query(`INSERT INTO ${q}.youtube_groups SELECT id,state,result FROM jsonb_to_recordset($1::jsonb) AS x(id text,state jsonb,result jsonb)`,[JSON.stringify(groups)]);
    await client.query(`INSERT INTO ${q}.youtube_videos SELECT "group",id,position,data FROM jsonb_to_recordset($1::jsonb) AS x("group" text,id text,position integer,data jsonb)`,[JSON.stringify(videos)]);
    await client.query(`INSERT INTO ${q}.youtube_comments SELECT "group",video,id,position,data FROM jsonb_to_recordset($1::jsonb) AS x("group" text,video text,id text,position integer,data jsonb)`,[JSON.stringify(comments)]);
    await client.query(`INSERT INTO ${q}.youtube_meta VALUES ('keywords',$1::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,[JSON.stringify(saved.keywords)]);
  }
  return {
    async exclusive<T>(work: () => Promise<T>) {
      loadPrivateEnv();
      if (isReadOnlyMode()) throw new Error('YouTube storage is local-only');
      const settings = postgresSettingsFromEnv();
      q = '"' + settings.schema + '"'; // Validated by the core configuration parser.
      const pool = createPostgresPool(settings);
      const connection = await pool.connect();
      client = connection;
      migrated = false;
      try {
        await client.query('BEGIN');
        // External collection and CLI inference are bounded but may exceed the server's idle default.
        await client.query("SET LOCAL idle_in_transaction_session_timeout = '10min'");
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`,[settings.schema + ':youtube-collection']);
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${q}`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${q}.youtube_meta (key text PRIMARY KEY,value jsonb NOT NULL)`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${q}.youtube_groups (group_key text PRIMARY KEY,state jsonb NOT NULL,result jsonb NOT NULL)`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${q}.youtube_videos (group_key text REFERENCES ${q}.youtube_groups(group_key) ON DELETE CASCADE,video_id text,position integer NOT NULL,data jsonb NOT NULL,PRIMARY KEY(group_key,video_id))`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${q}.youtube_comments (group_key text,video_id text,comment_id text,position integer NOT NULL,data jsonb NOT NULL,PRIMARY KEY(group_key,video_id,comment_id),FOREIGN KEY(group_key,video_id) REFERENCES ${q}.youtube_videos(group_key,video_id) ON DELETE CASCADE)`);
        await client.query(`CREATE TABLE IF NOT EXISTS ${q}.youtube_runs (id bigserial PRIMARY KEY,started_at timestamptz NOT NULL,ended_at timestamptz NOT NULL,status text NOT NULL,calls integer NOT NULL,added integer NOT NULL,pending integer NOT NULL)`);
        const result = await work();
        await client.query('COMMIT');
        // Only remove the legacy copy after the database transaction committed.
        if (migrated) await fs.unlink(legacyFile).catch(() => {});
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { connection.release(); await pool.end(); }
    },
    async read() {
      const meta = await client.query(`SELECT value FROM ${q}.youtube_meta WHERE key='keywords'`);
      if (!meta.rows.length) {
        let saved: Saved = {version:1,keywords:[],groups:{}};
        try { saved = JSON.parse(await fs.readFile(legacyFile,'utf8')); migrated = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        await write(saved);
        if (migrated) await client.query(`INSERT INTO ${q}.youtube_runs(started_at,ended_at,status,calls,added,pending) VALUES(NOW(),NOW(),'migrated',0,0,0)`);
        return saved;
      }
      const saved: Saved = {version:1,keywords:meta.rows[0].value,groups:{}};
      const groups = await client.query(`SELECT * FROM ${q}.youtube_groups`);
      for (const row of groups.rows) saved.groups[row.group_key] = {state:row.state,result:{...row.result,videos:[]}};
      const videos = await client.query(`SELECT * FROM ${q}.youtube_videos ORDER BY position`);
      const lookup = new Map<string, Saved['groups'][string]['result']['videos'][number]>();
      for (const row of videos.rows) {
        const video = {...row.data,comments:[]};
        saved.groups[row.group_key].result.videos.push(video);
        lookup.set(JSON.stringify([row.group_key,row.video_id]),video);
      }
      const comments = await client.query(`SELECT * FROM ${q}.youtube_comments ORDER BY position`);
      for (const row of comments.rows) lookup.get(JSON.stringify([row.group_key,row.video_id]))!.comments.push(row.data);
      return saved;
    },
    write,
    async recordRun(run) {
      await client.query(`INSERT INTO ${q}.youtube_runs(started_at,ended_at,status,calls,added,pending) VALUES($1,$2,$3,$4,$5,$6)`,[run.startedAt,run.endedAt,run.status,run.calls,run.added,run.pending]);
    },
  };
}
