-- Migration: Remove clustering and radial offset columns from display_config_rules
-- This completely removes node displacement functionality

-- Note: In SQLite, ALTER TABLE DROP COLUMN is available in version 3.35.0+
-- We'll use the DROP COLUMN syntax for simplicity if supported, 
-- otherwise a full table recreation would be needed.
-- Assuming recent enough SQLite for standard DROP.

ALTER TABLE display_config_rules DROP COLUMN cluster_enabled;
ALTER TABLE display_config_rules DROP COLUMN cluster_radius;
ALTER TABLE display_config_rules DROP COLUMN cluster_max_zoom;
ALTER TABLE display_config_rules DROP COLUMN cluster_min_points;
ALTER TABLE display_config_rules DROP COLUMN radial_offset;
