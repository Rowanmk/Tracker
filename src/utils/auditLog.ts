import { supabase } from '../supabase/client';
import type { Database, Json } from '../supabase/types';

type AuditLogInsert = Database['public']['Tables']['audit_logs']['Insert'];

interface CreateAuditLogParams {
  pagePath: string;
  pageLabel: string;
  actionType: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  actorStaffId?: number | null;
  teamId?: number | null;
  metadata?: Json;
}

export async function createAuditLog({
  pagePath,
  pageLabel,
  actionType,
  entityType,
  entityId = null,
  description,
  actorStaffId = null,
  teamId = null,
  metadata = {},
}: CreateAuditLogParams): Promise<void> {
  const payload: AuditLogInsert = {
    page_path: pagePath,
    page_label: pageLabel,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    description,
    staff_id: actorStaffId,
    team_id: teamId,
    metadata,
  };

  await supabase.from('audit_logs').insert(payload);
}