import sqlite3
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

class DisplayRuleRepository:
    """Repository for managing display configurations and rules in SQLite."""

    def __init__(self, db_path: str):
        self.db_path = db_path

    def _get_conn(self, write=False):
        # Using uri=True to allow mode=ro if we wanted, but routes usually need write
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_dict(self, val: Any) -> Dict[str, Any]:
        if not val: return {}
        if isinstance(val, dict): return val
        if isinstance(val, str):
            try: return json.loads(val)
            except: return {}
        return {}

    # ── Config / Profile Operations ──────────────────────────────────

    def list_configs(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute("""
                SELECT c.*, 
                (SELECT COUNT(*) FROM display_config_rules WHERE config_id = c.id) as rules_count
                FROM display_configs c
                ORDER BY is_default DESC, name ASC
            """).fetchall()
            return [dict(r) for r in rows]

    def get_config(self, config_id: int) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            return dict(row) if row else None

    def get_default_config(self) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM display_configs WHERE is_default = 1 LIMIT 1").fetchone()
            return dict(row) if row else None

    def create_config(self, name: str, description: str = "") -> Dict[str, Any]:
        current_name = name
        while True:
            try:
                with self._get_conn() as conn:
                    cursor = conn.execute(
                        "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)",
                        (current_name, description)
                    )
                    config_id = cursor.lastrowid
                    conn.commit()
                    return self.get_config(config_id)
            except sqlite3.IntegrityError:
                current_name = f"{current_name} (New)"

    def update_config(self, config_id: int, name: str, description: str) -> Optional[Dict[str, Any]]:
        current_name = name
        while True:
            try:
                with self._get_conn() as conn:
                    cursor = conn.execute(
                        "UPDATE display_configs SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (current_name, description, config_id)
                    )
                    if cursor.rowcount == 0:
                        return None
                    conn.commit()
                    return self.get_config(config_id)
            except sqlite3.IntegrityError:
                current_name = f"{name} ({datetime.now().strftime('%H%M%S')})"

    def delete_config(self, config_id: int) -> bool:
        with self._get_conn() as conn:
            # Note: Business logic for 'is_default' check is handled in the Service/Route layer
            # but we could also enforce it here.
            cursor = conn.execute("DELETE FROM display_configs WHERE id = ?", (config_id,))
            conn.commit()
            return cursor.rowcount > 0

    def set_default_config(self, config_id: int) -> bool:
        with self._get_conn() as conn:
            conn.execute("BEGIN TRANSACTION")
            try:
                conn.execute("UPDATE display_configs SET is_default = 0")
                cursor = conn.execute("UPDATE display_configs SET is_default = 1 WHERE id = ?", (config_id,))
                if cursor.rowcount == 0:
                    conn.execute("ROLLBACK")
                    return False
                conn.commit()
                return True
            except Exception:
                conn.execute("ROLLBACK")
                raise

    # ── Rule Operations ──────────────────────────────────────────────

    def list_rules(self, config_id: int, enabled_only: bool = False) -> List[Dict[str, Any]]:
        query = "SELECT * FROM display_config_rules WHERE config_id = ?"
        if enabled_only:
            query += " AND enabled = 1"
        query += " ORDER BY priority DESC, name ASC"

        with self._get_conn() as conn:
            rows = conn.execute(query, (config_id,)).fetchall()
            result = []
            for r in rows:
                rd = dict(r)
                rd['match_conditions'] = self._ensure_dict(rd.get('match_conditions'))
                rd['config'] = self._ensure_dict(rd.get('config'))
                result.append(rd)
            return result

    def get_rule(self, rule_id: int) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM display_config_rules WHERE id = ?", (rule_id,)).fetchone()
            if not row: return None
            rd = dict(row)
            rd['match_conditions'] = self._ensure_dict(rd.get('match_conditions'))
            rd['config'] = self._ensure_dict(rd.get('config'))
            return rd

    def create_rule(self, config_id: int, rule_data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    config_id, 
                    rule_data['name'], 
                    rule_data.get('priority', 0), 
                    json.dumps(rule_data.get('match_conditions', {})), 
                    json.dumps(rule_data.get('config', {})), 
                    1 if rule_data.get('enabled', True) else 0
                )
            )
            new_id = cursor.lastrowid
            conn.commit()
            return self.get_rule(new_id)

    def update_rule(self, rule_id: int, rule_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.execute(
                """UPDATE display_config_rules 
                   SET name = ?, priority = ?, match_conditions = ?, config = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (
                    rule_data['name'], 
                    rule_data.get('priority', 0), 
                    json.dumps(rule_data.get('match_conditions', {})), 
                    json.dumps(rule_data.get('config', {})), 
                    1 if rule_data.get('enabled', True) else 0, 
                    rule_id
                )
            )
            if cursor.rowcount == 0:
                return None
            conn.commit()
            return self.get_rule(rule_id)

    def delete_rule(self, rule_id: int) -> bool:
        with self._get_conn() as conn:
            cursor = conn.execute("DELETE FROM display_config_rules WHERE id = ?", (rule_id,))
            conn.commit()
            return cursor.rowcount > 0

    def duplicate_rule(self, rule_id: int) -> Optional[Dict[str, Any]]:
        rule = self.get_rule(rule_id)
        if not rule: return None
        
        new_data = {
            "name": f"{rule['name']} (Copy)",
            "priority": rule['priority'],
            "match_conditions": rule['match_conditions'],
            "config": rule['config'],
            "enabled": rule['enabled']
        }
        return self.create_rule(rule['config_id'], new_data)

    # ── Composite / Bulk Operations ──────────────────────────────────

    def get_active_config_with_rules(self) -> Dict[str, Any]:
        config = self.get_default_config()
        if not config:
            return {"config": None, "rules": []}
        
        rules = self.list_rules(config['id'], enabled_only=True)
        return {
            "config": config,
            "rules": rules
        }

    def import_config(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self._get_conn() as conn:
            conn.execute("BEGIN TRANSACTION")
            try:
                name = data['profile']['name']
                # Check for collisions
                existing = conn.execute("SELECT id FROM display_configs WHERE name = ?", (name,)).fetchone()
                if existing:
                    name = f"{name} (Imported {datetime.now().date().isoformat()})"
                
                cursor = conn.execute(
                    "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)",
                    (name, data['profile'].get('description', ''))
                )
                config_id = cursor.lastrowid
                
                for rule in data['rules']:
                    conn.execute(
                        """INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (
                            config_id, 
                            rule['name'], 
                            rule.get('priority', 0), 
                            json.dumps(rule['match_conditions']), 
                            json.dumps(rule['config']), 
                            1 if rule.get('enabled', True) else 0
                        )
                    )
                
                conn.commit()
                return self.get_config(config_id)
            except Exception:
                conn.execute("ROLLBACK")
                raise
