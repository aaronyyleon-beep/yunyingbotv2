import { randomUUID } from "node:crypto";
import type { AppDbClient } from "../db/client.js";

const nowIso = () => new Date().toISOString();

export type IntegrationPlatform = "telegram" | "discord" | "twitter" | "onchain";
export type IntegrationStatus = "active" | "revoked" | "expired";
export type TargetStatus = "active" | "revoked" | "expired";
export type TaskSourceBindingStatus = "active" | "invalid" | "revoked";

export interface TenantIntegrationRow {
  [key: string]: unknown;
  id: string;
  tenant_id: string;
  platform: string;
  status: string;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantTargetRow {
  [key: string]: unknown;
  id: string;
  integration_id: string;
  target_type: string;
  target_id: string;
  target_label: string | null;
  permissions_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TaskSourceBindingRow {
  [key: string]: unknown;
  id: string;
  task_id: string;
  source_id: string;
  tenant_target_id: string;
  binding_status: string;
  created_at: string;
  updated_at: string;
}

export const upsertTenantIntegration = async (
  db: AppDbClient,
  input: {
    id?: string;
    tenantId: string;
    platform: IntegrationPlatform;
    status: IntegrationStatus;
    metadataJson?: string | null;
  }
) => {
  const now = nowIso();
  const integrationId = input.id ?? randomUUID();

  await db.execute(
    `INSERT INTO tenant_integrations (
      id, tenant_id, platform, status, metadata_json, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (tenant_id, platform)
    DO UPDATE SET
      status = EXCLUDED.status,
      metadata_json = EXCLUDED.metadata_json,
      updated_at = EXCLUDED.updated_at`,
    [integrationId, input.tenantId, input.platform, input.status, input.metadataJson ?? null, now, now]
  );

  const row = await db.one<{ id: string }>(
    `SELECT id FROM tenant_integrations WHERE tenant_id = $1 AND platform = $2`,
    [input.tenantId, input.platform]
  );

  return { id: row?.id ?? integrationId, updatedAt: now };
};

export const listTenantIntegrations = async (
  db: AppDbClient,
  tenantId: string
): Promise<TenantIntegrationRow[]> =>
  db.query<TenantIntegrationRow>(
    `SELECT id, tenant_id, platform, status, metadata_json, created_at, updated_at
     FROM tenant_integrations
     WHERE tenant_id = $1
     ORDER BY platform ASC`,
    [tenantId]
  );

export const upsertTenantTarget = async (
  db: AppDbClient,
  input: {
    id?: string;
    integrationId: string;
    targetType: string;
    targetId: string;
    targetLabel?: string | null;
    permissionsJson?: string | null;
    status: TargetStatus;
  }
) => {
  const now = nowIso();
  const id = input.id ?? randomUUID();

  await db.execute(
    `INSERT INTO tenant_targets (
      id, integration_id, target_type, target_id, target_label, permissions_json, status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (integration_id, target_type, target_id)
    DO UPDATE SET
      target_label = EXCLUDED.target_label,
      permissions_json = EXCLUDED.permissions_json,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      input.integrationId,
      input.targetType,
      input.targetId,
      input.targetLabel ?? null,
      input.permissionsJson ?? null,
      input.status,
      now,
      now
    ]
  );

  const row = await db.one<{ id: string }>(
    `SELECT id
     FROM tenant_targets
     WHERE integration_id = $1
       AND target_type = $2
       AND target_id = $3`,
    [input.integrationId, input.targetType, input.targetId]
  );

  return { id: row?.id ?? id, updatedAt: now };
};

export const listTenantTargets = async (
  db: AppDbClient,
  input: {
    tenantId: string;
    platform?: IntegrationPlatform;
  }
): Promise<TenantTargetRow[]> => {
  if (input.platform) {
    return db.query<TenantTargetRow>(
      `SELECT
         t.id,
         t.integration_id,
         t.target_type,
         t.target_id,
         t.target_label,
         t.permissions_json,
         t.status,
         t.created_at,
         t.updated_at
       FROM tenant_targets t
       JOIN tenant_integrations i ON i.id = t.integration_id
       WHERE i.tenant_id = $1
         AND i.platform = $2
       ORDER BY t.created_at DESC`,
      [input.tenantId, input.platform]
    );
  }

  return db.query<TenantTargetRow>(
    `SELECT
       t.id,
       t.integration_id,
       t.target_type,
       t.target_id,
       t.target_label,
       t.permissions_json,
       t.status,
       t.created_at,
       t.updated_at
     FROM tenant_targets t
     JOIN tenant_integrations i ON i.id = t.integration_id
     WHERE i.tenant_id = $1
     ORDER BY t.created_at DESC`,
    [input.tenantId]
  );
};

export const upsertTaskSourceBinding = async (
  db: AppDbClient,
  input: {
    id?: string;
    taskId: string;
    sourceId: string;
    tenantTargetId: string;
    bindingStatus?: TaskSourceBindingStatus;
  }
) => {
  const now = nowIso();
  const id = input.id ?? randomUUID();
  const bindingStatus = input.bindingStatus ?? "active";

  await db.execute(
    `INSERT INTO task_source_bindings (
      id, task_id, source_id, tenant_target_id, binding_status, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (task_id, source_id)
    DO UPDATE SET
      tenant_target_id = EXCLUDED.tenant_target_id,
      binding_status = EXCLUDED.binding_status,
      updated_at = EXCLUDED.updated_at`,
    [id, input.taskId, input.sourceId, input.tenantTargetId, bindingStatus, now, now]
  );

  const row = await db.one<{ id: string }>(
    `SELECT id FROM task_source_bindings WHERE task_id = $1 AND source_id = $2`,
    [input.taskId, input.sourceId]
  );

  return { id: row?.id ?? id, updatedAt: now };
};

export const listTaskSourceBindings = async (
  db: AppDbClient,
  taskId: string
): Promise<
  Array<
    TaskSourceBindingRow & {
      source_type: string;
      source_url: string;
      target_type: string;
      target_id: string;
      target_label: string | null;
      platform: string;
      tenant_id: string;
      target_status: string;
      integration_status: string;
    }
  >
> =>
  db.query(
    `SELECT
       b.id,
       b.task_id,
       b.source_id,
       b.tenant_target_id,
       b.binding_status,
       b.created_at,
       b.updated_at,
       s.source_type,
       s.source_url,
       t.target_type,
       t.target_id,
       t.target_label,
       t.status AS target_status,
       i.platform,
       i.tenant_id,
       i.status AS integration_status
     FROM task_source_bindings b
     JOIN sources s ON s.id = b.source_id
     JOIN tenant_targets t ON t.id = b.tenant_target_id
     JOIN tenant_integrations i ON i.id = t.integration_id
     WHERE b.task_id = $1
     ORDER BY b.created_at DESC`,
    [taskId]
  );
