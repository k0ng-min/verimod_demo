import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/** 이 앱 전용 개발 DB. 기존 backend의 원본 DB(receipts·epochs)와 파일·테이블이 모두 분리되어 있다.
 * 영수증 자체는 여기 복사하지 않고 receipt_id·hash 참조와 화면용 요약만 둔다. */
const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;


CREATE TABLE IF NOT EXISTS analysis_sessions (
  session_id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  owner_token_hash TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1)),
  phase TEXT NOT NULL,
  source_json TEXT NOT NULL,
  options_json TEXT NOT NULL,
  notices_json TEXT NOT NULL,
  filter_json TEXT,
  semantic_json TEXT,
  settings_json TEXT NOT NULL,
  stop_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collected_comments (
  session_id TEXT NOT NULL REFERENCES analysis_sessions(session_id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  comment_json TEXT NOT NULL,
  PRIMARY KEY (session_id, comment_id)
);

CREATE TABLE IF NOT EXISTS session_items (
  session_id TEXT NOT NULL REFERENCES analysis_sessions(session_id) ON DELETE CASCADE,
  comment_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('SELECTED','ISSUING','ISSUED','FAILED','DEMO_JUDGED','CANCELLED')),
  receipt_id TEXT,
  receipt_hash TEXT,
  summary_json TEXT,
  private_json TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, comment_id),
  FOREIGN KEY (session_id, comment_id) REFERENCES collected_comments(session_id, comment_id)
);
`

export function openServiceDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const database = new DatabaseSync(path)
  database.exec(SCHEMA)
  // 서비스가 발급 도중 꺼졌다면 같은 idempotency key로 다시 시도할 수 있게 되돌린다.
  // backend가 이미 완료한 요청이면 같은 key 재요청에 저장된 응답을 그대로 돌려준다(중복 발급 없음).
  database.prepare("UPDATE session_items SET status = 'SELECTED' WHERE status = 'ISSUING'").run()
  database.prepare("UPDATE analysis_sessions SET phase = 'STOPPED', stop_reason = 'SERVICE_RESTARTED' WHERE phase = 'RUNNING'").run()
  return database
}

export function tx<T>(database: DatabaseSync, run: () => T): T {
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = run()
    database.exec('COMMIT')
    return result
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
