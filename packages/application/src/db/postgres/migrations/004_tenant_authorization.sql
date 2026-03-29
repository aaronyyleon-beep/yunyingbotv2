CREATE TABLE IF NOT EXISTS tenant_integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, platform)
);

CREATE TABLE IF NOT EXISTS tenant_targets (
  id TEXT PRIMARY KEY,
  integration_id TEXT NOT NULL REFERENCES tenant_integrations(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_label TEXT,
  permissions_json TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (integration_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS task_source_bindings (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES analysis_tasks(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  tenant_target_id TEXT NOT NULL REFERENCES tenant_targets(id) ON DELETE RESTRICT,
  binding_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (task_id, source_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_platform ON tenant_integrations(platform);
CREATE INDEX IF NOT EXISTS idx_tenant_targets_integration ON tenant_targets(integration_id);
CREATE INDEX IF NOT EXISTS idx_tenant_targets_target ON tenant_targets(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_task_source_bindings_task ON task_source_bindings(task_id);
CREATE INDEX IF NOT EXISTS idx_task_source_bindings_source ON task_source_bindings(source_id);
CREATE INDEX IF NOT EXISTS idx_task_source_bindings_target ON task_source_bindings(tenant_target_id);
