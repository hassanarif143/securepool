-- Default rotation rows (disabled) so admin UI always has one row per template

INSERT INTO auto_rotation_config (template_id, min_active_count, max_active_count, auto_create_on_fill, enabled)
SELECT id, 2, 5, FALSE, FALSE FROM pool_templates
ON CONFLICT (template_id) DO NOTHING;
