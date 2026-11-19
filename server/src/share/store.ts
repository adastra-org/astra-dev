// Shared conversations in SQLite (`bun:sqlite`, WAL). This is the only place the server keeps chat
// text, so it is a file of its own (`SHARE_DB_PATH`), not the usage records: those never hold text.
// One file shared by the blue and green slots (outside the slot dirs). A link is stored as the
// SHA-256 of its token, so a copy of the file reveals no link. Revoking deletes the row, text included.
import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export type ShareAudience = 'staff' | 'public'

export interface ShareRow {
  id: string
  ownerId: string
  /** The sharer's handle. `null` for `public` links: they are anonymous by design. */
  ownerHandle: string | null
  audience: ShareAudience
  createdAt: number
  expiresAt: number
  turns: number
  views: number
  /** Serialized, already redacted conversation. */
  payload: string
}

export type NewShare = Omit<ShareRow, 'views'> & { tokenHash: string }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shared_chats (
  id           TEXT    PRIMARY KEY,
  token_hash   TEXT    NOT NULL UNIQUE,
  owner_id     TEXT    NOT NULL,
  owner_handle TEXT,
  audience     TEXT    NOT NULL CHECK (audience IN ('staff', 'public')),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  turns        INTEGER NOT NULL,
  views        INTEGER NOT NULL DEFAULT 0,
  payload      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_owner ON shared_chats(owner_id);
CREATE INDEX IF NOT EXISTS shared_expires ON shared_chats(expires_at);
`

interface Raw {
  id: string
  owner_id: string
  owner_handle: string | null
  audience: ShareAudience
  created_at: number
  expires_at: number
  turns: number
  views: number
  payload: string
}

const toRow = (r: Raw): ShareRow => ({
  id: r.id,
  ownerId: r.owner_id,
  ownerHandle: r.owner_handle,
  audience: r.audience,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  turns: r.turns,
  views: r.views,
  payload: r.payload,
})

const COLUMNS =
  'id, owner_id, owner_handle, audience, created_at, expires_at, turns, views, payload'

export type CreateResult = 'ok' | 'viewer_limit' | 'global_limit'

export class ShareStore {
  readonly #db: Database

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.#db = new Database(path, { create: true })
    // Blue and green can both write the file during a deploy.
    this.#db.run('PRAGMA journal_mode = WAL')
    this.#db.run('PRAGMA busy_timeout = 3000')
    this.#db.run('PRAGMA synchronous = NORMAL')
    this.#db.run(SCHEMA)
  }

  /**
   * Inserts a share unless a cap is reached. The counts and the insert run in one transaction, so
   * two requests cannot both slip under the limit.
   */
  create(
    s: NewShare,
    caps: { perViewer: number; active: number },
    now: number,
  ): CreateResult {
    return this.#db.transaction((): CreateResult => {
      const mine = this.#db
        .query(
          'SELECT COUNT(*) AS n FROM shared_chats WHERE owner_id = ? AND expires_at > ?',
        )
        .get(s.ownerId, now) as { n: number }
      if (mine.n >= caps.perViewer) return 'viewer_limit'
      const all = this.#db
        .query('SELECT COUNT(*) AS n FROM shared_chats WHERE expires_at > ?')
        .get(now) as { n: number }
      if (all.n >= caps.active) return 'global_limit'
      this.#db
        .query(
          `INSERT INTO shared_chats (id, token_hash, owner_id, owner_handle, audience, created_at,
            expires_at, turns, payload)
           VALUES ($id, $tokenHash, $ownerId, $ownerHandle, $audience, $createdAt, $expiresAt,
            $turns, $payload)`,
        )
        .run({
          $id: s.id,
          $tokenHash: s.tokenHash,
          $ownerId: s.ownerId,
          $ownerHandle: s.ownerHandle,
          $audience: s.audience,
          $createdAt: s.createdAt,
          $expiresAt: s.expiresAt,
          $turns: s.turns,
          $payload: s.payload,
        })
      return 'ok'
    })()
  }

  /** The live share behind a token hash. An expired one is deleted on the spot and reads as missing. */
  findByHash(tokenHash: string, now: number): ShareRow | null {
    const raw = this.#db
      .query(`SELECT ${COLUMNS} FROM shared_chats WHERE token_hash = ?`)
      .get(tokenHash) as Raw | null
    if (!raw) return null
    if (raw.expires_at <= now) {
      this.#db.run('DELETE FROM shared_chats WHERE id = ?', [raw.id])
      return null
    }
    return toRow(raw)
  }

  /** A live share by id, for revoking. */
  get(id: string, now: number): ShareRow | null {
    const raw = this.#db
      .query(
        `SELECT ${COLUMNS} FROM shared_chats WHERE id = ? AND expires_at > ?`,
      )
      .get(id, now) as Raw | null
    return raw ? toRow(raw) : null
  }

  /** The caller's live shares, newest first. The text stays in the row: only summaries are read. */
  listByOwner(ownerId: string, now: number): ShareRow[] {
    return (
      this.#db
        .query(
          `SELECT ${COLUMNS} FROM shared_chats WHERE owner_id = ? AND expires_at > ?
           ORDER BY created_at DESC`,
        )
        .all(ownerId, now) as Raw[]
    ).map(toRow)
  }

  addView(id: string): void {
    this.#db.run('UPDATE shared_chats SET views = views + 1 WHERE id = ?', [id])
  }

  /** Deletes the row, text included. `false` = it was not there. */
  delete(id: string): boolean {
    return (
      this.#db.run('DELETE FROM shared_chats WHERE id = ?', [id]).changes > 0
    )
  }

  /** Drops every expired row. Returns how many. */
  purge(now: number): number {
    return this.#db.run('DELETE FROM shared_chats WHERE expires_at <= ?', [now])
      .changes
  }

  /** Test and diagnostics handle: a raw read. */
  query<T>(sql: string, ...params: (string | number | null)[]): T[] {
    return this.#db.query(sql).all(...params) as T[]
  }

  close() {
    this.#db.close()
  }
}
