CREATE TABLE IF NOT EXISTS onchain_lp_candidates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  chain_key TEXT NOT NULL,
  dex_label TEXT NOT NULL,
  quote_token_label TEXT NOT NULL,
  lp_address TEXT NOT NULL,
  confidence TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(source_id, lp_address)
);

CREATE TABLE IF NOT EXISTS community_message_buffer (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_chat_id TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  chat_title TEXT,
  author_id TEXT,
  author_label TEXT,
  text_content TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  raw_payload TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(platform, external_chat_id, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_onchain_lp_candidates_task_id ON onchain_lp_candidates(task_id);
CREATE INDEX IF NOT EXISTS idx_onchain_lp_candidates_source_id ON onchain_lp_candidates(source_id);
CREATE INDEX IF NOT EXISTS idx_community_message_buffer_platform_chat ON community_message_buffer(platform, external_chat_id);
