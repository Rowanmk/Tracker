BEGIN;

WITH self_assessment_services AS (
  SELECT
    service_id,
    service_name
  FROM public.services
  WHERE service_name IN ('Self Assessments', 'Self Assessment')
),
raw_audit_changes AS (
  SELECT
    al.id AS audit_log_id,
    al.created_at AS audit_created_at,
    substring(COALESCE(al.metadata::jsonb ->> 'financial_year', '') FROM '^([0-9]{4})/')::integer AS fy_start_year,
    (affected_user.user_json ->> 'staff_id')::integer AS staff_id,
    COALESCE(affected_user.user_json ->> 'name', '') AS staff_name,
    sas.service_id,
    sas.service_name,
    (change_item.change_json ->> 'month')::integer AS month,
    ROUND((change_item.change_json ->> 'previous_value')::numeric)::integer AS restored_target_value,
    ROUND((change_item.change_json ->> 'new_value')::numeric)::integer AS overwritten_target_value
  FROM public.audit_logs al
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(COALESCE(al.metadata::jsonb, '{}'::jsonb) -> 'affected_users') = 'array'
      THEN COALESCE(al.metadata::jsonb, '{}'::jsonb) -> 'affected_users'
      ELSE '[]'::jsonb
    END
  ) AS affected_user(user_json)
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(affected_user.user_json -> 'changes') = 'array'
      THEN affected_user.user_json -> 'changes'
      ELSE '[]'::jsonb
    END
  ) AS change_item(change_json)
  INNER JOIN self_assessment_services sas
    ON sas.service_name = change_item.change_json ->> 'service_name'
  WHERE al.page_path = '/targets'
    AND al.entity_type = 'monthly_targets'
    AND COALESCE(al.metadata::jsonb ->> 'financial_year', '') ~ '^[0-9]{4}/[0-9]{2}$'
    AND COALESCE(affected_user.user_json ->> 'staff_id', '') ~ '^[0-9]+$'
    AND COALESCE(change_item.change_json ->> 'month', '') ~ '^[0-9]+$'
    AND COALESCE(change_item.change_json ->> 'previous_value', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
    AND COALESCE(change_item.change_json ->> 'new_value', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
),
normalized_audit_changes AS (
  SELECT
    audit_log_id,
    audit_created_at,
    staff_id,
    staff_name,
    service_id,
    service_name,
    month,
    CASE
      WHEN month >= 4 THEN fy_start_year
      ELSE fy_start_year + 1
    END AS year,
    restored_target_value,
    overwritten_target_value
  FROM raw_audit_changes
  WHERE month BETWEEN 1 AND 12
    AND restored_target_value <> overwritten_target_value
),
actuals_by_cell AS (
  SELECT
    da.staff_id,
    da.service_id,
    da.month,
    da.year,
    SUM(COALESCE(da.delivered_count, 0))::integer AS actual_value
  FROM public.dailyactivity da
  INNER JOIN self_assessment_services sas
    ON sas.service_id = da.service_id
  WHERE da.staff_id IS NOT NULL
    AND da.service_id IS NOT NULL
  GROUP BY
    da.staff_id,
    da.service_id,
    da.month,
    da.year
),
ranked_restorable_changes AS (
  SELECT
    nac.*,
    abc.actual_value,
    ROW_NUMBER() OVER (
      PARTITION BY nac.staff_id, nac.service_id, nac.month, nac.year
      ORDER BY nac.audit_created_at DESC, nac.audit_log_id DESC
    ) AS change_rank
  FROM normalized_audit_changes nac
  INNER JOIN actuals_by_cell abc
    ON abc.staff_id = nac.staff_id
   AND abc.service_id = nac.service_id
   AND abc.month = nac.month
   AND abc.year = nac.year
  WHERE nac.overwritten_target_value = abc.actual_value
),
updated_targets AS (
  UPDATE public.monthlytargets mt
  SET target_value = rrc.restored_target_value
  FROM ranked_restorable_changes rrc
  WHERE rrc.change_rank = 1
    AND mt.staff_id = rrc.staff_id
    AND mt.service_id = rrc.service_id
    AND mt.month = rrc.month
    AND mt.year = rrc.year
    AND mt.target_value = rrc.overwritten_target_value
  RETURNING
    mt.target_id,
    mt.staff_id,
    rrc.staff_name,
    mt.service_id,
    rrc.service_name,
    mt.month,
    mt.year,
    rrc.overwritten_target_value,
    rrc.restored_target_value,
    rrc.actual_value,
    rrc.audit_log_id,
    rrc.audit_created_at
)
INSERT INTO public.audit_logs (
  page_path,
  page_label,
  action_type,
  entity_type,
  entity_id,
  description,
  staff_id,
  team_id,
  metadata
)
SELECT
  '/targets',
  'Targets Control',
  'restore',
  'monthly_targets',
  'self-assessment-target-reconstruction',
  'Reconstructed Self Assessment target values from audit log entries where targets had been overwritten by actuals',
  NULL,
  NULL,
  jsonb_build_object(
    'source', 'reconstruct_self_assessment_targets_from_audit_log',
    'restored_cell_count', COUNT(*),
    'affected_user_ids', jsonb_agg(DISTINCT staff_id),
    'restored_cells', jsonb_agg(
      jsonb_build_object(
        'target_id', target_id,
        'staff_id', staff_id,
        'staff_name', staff_name,
        'service_id', service_id,
        'service_name', service_name,
        'month', month,
        'year', year,
        'overwritten_value', overwritten_target_value,
        'restored_value', restored_target_value,
        'actual_value', actual_value,
        'source_audit_log_id', audit_log_id,
        'source_audit_created_at', audit_created_at
      )
      ORDER BY staff_name, year, month, service_name
    )
  )
FROM updated_targets
HAVING COUNT(*) > 0;

COMMIT;