import sqlite3
import json
import logging
from typing import Dict, Any, List
from src.shared.database_setup import RULES_DB_PATH

logger = logging.getLogger(__name__)

class DisplayRuleIO:
    """Handles import/export of display configuration profiles and their rules."""

    def __init__(self, db_path: str = RULES_DB_PATH):
        self.db_path = db_path

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def export_config(self, config_id: int) -> Dict[str, Any]:
        """Serializes a display configuration and its rules to a dictionary."""
        try:
            with self._get_conn() as conn:
                # 1. Fetch config metadata
                config_row = conn.execute(
                    "SELECT name, description, is_default FROM display_configs WHERE id = ?",
                    (config_id,)
                ).fetchone()
                
                if not config_row:
                    raise ValueError(f"Display configuration with ID {config_id} not found.")

                # 2. Fetch rules
                rules_rows = conn.execute(
                    "SELECT name, priority, match_conditions, config, enabled FROM display_config_rules WHERE config_id = ? ORDER BY priority DESC",
                    (config_id,)
                ).fetchall()

                rules = []
                for row in rules_rows:
                    rule_dict = dict(row)
                    # Parse JSON fields if they are strings
                    if isinstance(rule_dict['match_conditions'], str):
                        try: rule_dict['match_conditions'] = json.loads(rule_dict['match_conditions'])
                        except: rule_dict['match_conditions'] = {}
                    if isinstance(rule_dict['config'], str):
                        try: rule_dict['config'] = json.loads(rule_dict['config'])
                        except: rule_dict['config'] = {}
                    rules.append(rule_dict)

                return {
                    "version": "1.0",
                    "type": "display_config_profile",
                    "metadata": dict(config_row),
                    "rules": rules
                }
        except Exception as e:
            logger.error(f"Error exporting display config {config_id}: {e}")
            raise

    def import_config(self, data: Dict[str, Any]) -> int:
        """Deserializes a dictionary and creates a new display configuration profile."""
        try:
            if data.get("type") != "display_config_profile":
                raise ValueError("Invalid import data: missing or incorrect 'type' field.")

            metadata = data.get("metadata", {})
            rules = data.get("rules", [])

            if not metadata.get("name"):
                raise ValueError("Invalid import data: profile name is required.")

            with self._get_conn() as conn:
                # 1. Create the new config profile
                base_name = metadata["name"]
                name = base_name
                counter = 1
                while True:
                    exists = conn.execute("SELECT 1 FROM display_configs WHERE name = ?", (name,)).fetchone()
                    if not exists:
                        break
                    # If it already has (Imported), don't keep nesting it
                    if " (Imported" in base_name:
                         base_name = base_name.split(" (Imported")[0]
                    name = f"{base_name} (Imported {counter})"
                    counter += 1

                cursor = conn.execute(
                    "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)",
                    (name, metadata.get("description", ""))
                )
                config_id = cursor.lastrowid

                # 2. Insert rules
                for rule in rules:
                    conn.execute(
                        """INSERT INTO display_config_rules 
                           (config_id, name, priority, match_conditions, config, enabled)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (
                            config_id,
                            rule["name"],
                            rule.get("priority", 0),
                            json.dumps(rule["match_conditions"]) if rule.get("match_conditions") is not None else None,
                            json.dumps(rule["config"]) if rule.get("config") is not None else None,
                            1 if rule.get("enabled", True) else 0
                        )
                    )
                
                conn.commit()
                return config_id
        except Exception as e:
            logger.error(f"Error importing display config: {e}")
            raise
