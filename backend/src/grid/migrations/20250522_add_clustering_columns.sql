-- Migration: Add clustering columns to display_config_rules
-- This replaces the single 'radial_offset' with a more powerful clustering system

-- 1. Add new columns
ALTER TABLE display_config_rules ADD COLUMN cluster_enabled INTEGER DEFAULT 0;
ALTER TABLE display_config_rules ADD COLUMN cluster_radius REAL DEFAULT 40.0;
ALTER TABLE display_config_rules ADD COLUMN cluster_max_zoom REAL DEFAULT 20.0;
ALTER TABLE display_config_rules ADD COLUMN cluster_min_points INTEGER DEFAULT 2;

-- 2. Note: 'radial_offset' is preserved for backward compatibility 
-- but will be ignored by the map if clustering is enabled.
