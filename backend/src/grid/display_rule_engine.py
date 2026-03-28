import sqlite3
import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

class DisplayRuleEngine:
    """Engine for classifying nodes based on admin-defined display rules."""

    def __init__(self, admin_db_path: str):
        self.admin_db_path = admin_db_path
        self._rules = []
        self._config_name = "None"
        self.load_rules()

    def load_rules(self):
        """Loads rules from the default configuration in the admin database."""
        try:
            conn = sqlite3.connect(self.admin_db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Find default config
            cursor.execute("SELECT id, name FROM display_configs WHERE is_default = 1 LIMIT 1")
            config = cursor.fetchone()
            
            if not config:
                logger.warning("No default display configuration found in admin database.")
                self._rules = []
                self._config_name = "None"
                return

            config_id = config['id']
            self._config_name = config['name']

            # Load rules for this config, ordered by priority (descending)
            cursor.execute("""
                SELECT * FROM display_config_rules 
                WHERE config_id = ? AND enabled = 1
                ORDER BY priority DESC
            """, (config_id,))
            
            self._rules = []
            for row in cursor.fetchall():
                rule = dict(row)
                # Parse conditions JSON
                try:
                    rule['match_conditions'] = json.loads(rule['match_conditions']) if rule.get('match_conditions') else {}
                except:
                    rule['match_conditions'] = {}
                
                # Parse config JSON
                try:
                    parsed_config = json.loads(rule['config']) if rule.get('config') else {}
                    rule['config'] = parsed_config if isinstance(parsed_config, dict) else {}
                except:
                    rule['config'] = {}
                
                self._rules.append(rule)

            conn.close()
            logger.info(f"Loaded {len(self._rules)} display rules from config '{self._config_name}'")
        except Exception as e:
            logger.error(f"Error loading display rules: {e}")
            self._rules = []

    def classify_node(self, node_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Classifies a node based on rules. Returns a dict {visual_type, size, label} of the first match.
        """
        if not self._rules:
            return None

        for rule in self._rules:
            # Nodes can match on equipment type or properties
            match, objects_to_check = self._matches_rule(rule, node_data, is_edge=False)
            if match:
                config = rule.get('config', {})
                # Evaluate CSS overrides
                active_css = []
                for override in (config.get('css_overrides') or []):
                    if self._check_conditions(override.get('conditions', {}), objects_to_check):
                        active_css.append(override.get('css', ""))
                
                return {
                    "rule_id": rule.get('id'),
                    "visual_type": config.get('visual_type', 'Custom'),
                    "size": config.get('size', 1.0),
                    "label": config.get('label', ""),
                    "icon": config.get('icon'),
                    "color_hex": config.get('color_hex'),
                    "radial_offset": config.get('radial_offset', 0.0),
                    "cluster_enabled": bool(config.get('cluster_enabled', False)),
                    "cluster_radius": config.get('cluster_radius', 40.0),
                    "cluster_max_zoom": config.get('cluster_max_zoom', 20.0),
                    "cluster_min_points": config.get('cluster_min_points', 2),
                    "min_zoom": config.get('min_zoom', 0.0),
                    "max_zoom": config.get('max_zoom', 24.0),
                    "rotate_to_edge": bool(config.get('rotate_to_edge', False)),
                    "display_css": "\n".join(active_css) if active_css else ""
                }
        
        return None

    def classify_edge(self, edge_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Classifies an edge based on rules. Returns a dict {visual_type, size, label} of the first match.
        """
        if not self._rules:
            return None

        for rule in self._rules:
            # Edges can match on edge_type or properties
            match, objects_to_check = self._matches_rule(rule, edge_data, is_edge=True)
            if match:
                config = rule.get('config', {})
                # Evaluate CSS overrides
                active_css = []
                for override in (config.get('css_overrides') or []):
                    if self._check_conditions(override.get('conditions', {}), objects_to_check):
                        active_css.append(override.get('css', ""))
                        
                return {
                    "rule_id": rule.get('id'),
                    "visual_type": config.get('visual_type', 'Custom'),
                    "size": config.get('size', 1.0),
                    "label": config.get('label', ""),
                    "icon": config.get('icon'),
                    "color_hex": config.get('color_hex'),
                    "radial_offset": config.get('radial_offset', 0.0),
                    "cluster_enabled": bool(config.get('cluster_enabled', False)),
                    "cluster_radius": config.get('cluster_radius', 40.0),
                    "cluster_max_zoom": config.get('cluster_max_zoom', 20.0),
                    "cluster_min_points": config.get('cluster_min_points', 2),
                    "min_zoom": config.get('min_zoom', 0.0),
                    "max_zoom": config.get('max_zoom', 24.0),
                    "rotate_to_edge": bool(config.get('rotate_to_edge', False)),
                    "display_css": "\n".join(active_css) if active_css else ""
                }
        
        return None

    def _get_nested_value(self, data: Any, path: str) -> Any:
        """Helper to traverse nested dicts/lists using dot notation."""
        parts = path.split('.')
        curr = data
        for part in parts:
            if isinstance(curr, dict):
                curr = curr.get(part)
            elif isinstance(curr, list):
                try:
                    curr = curr[int(part)]
                except (ValueError, IndexError):
                    return None
            else:
                return None
        return curr

    def _check_op(self, actual_val: Any, op: str, target_val: Any) -> bool:
        """Helper to evaluate operators."""
        if op == '==' : return actual_val == target_val
        if op == '!=' : return actual_val != target_val
        if op == 'exists': return actual_val is not None
        if op == 'not_exists': return actual_val is None
        
        # For numeric/sequence ops, ensure actual_val is not None
        if actual_val is None: return False
        
        try:
            # Coerce to float if comparing numerically
            if op in ('>', '<', '>=', '<='):
                actual_num = float(actual_val) if not isinstance(actual_val, (int, float)) else actual_val
                target_num = float(target_val) if not isinstance(target_val, (int, float)) else target_val
                
                if op == '>' : return actual_num > target_num
                if op == '<' : return actual_num < target_num
                if op == '>=': return actual_num >= target_num
                if op == '<=': return actual_num <= target_num
            
            if op == '==': return str(actual_val).lower() == str(target_val).lower()
            if op == '!=': return str(actual_val).lower() != str(target_val).lower()

            if op == 'contains': return isinstance(actual_val, str) and target_val in actual_val
            if op == 'length_gt': 
                return (isinstance(actual_val, (list, dict, str)) and len(actual_val) > int(target_val))
        except:
            # If coercion fails, fall back to string comparison or just fail
            try:
                if op == '==': return str(actual_val).lower() == str(target_val).lower()
            except:
                pass
            return False
        return False

    def _check_conditions(self, conditions_json: Dict[str, Any], objects_to_check: List[Dict[str, Any]]) -> bool:
        """
        Helper to evaluate complex conditional logic recursively.
        Supports:
        {
            "logical_op": "AND" | "OR",
            "conditions": [
                { "path": "...", "op": "...", "value": "..." }, # Simple condition
                { "logical_op": "...", "conditions": [...] }   # Nested group
            ]
        }
        """
        if not conditions_json:
            return True

        # Handle case where conditions are passed as a JSON string
        if isinstance(conditions_json, str):
            try:
                conditions_json = json.loads(conditions_json)
            except (json.JSONDecodeError, TypeError):
                logger.error(f"Failed to parse conditions JSON string: {conditions_json}")
                return True

        # Ensure we have a dictionary at this point
        if not isinstance(conditions_json, dict):
            logger.warning(f"Expected conditions to be a dict, got {type(conditions_json)}")
            return True

        logical_op = conditions_json.get('logical_op', 'AND').upper()
        rule_conditions = conditions_json.get('conditions', [])
        
        if not isinstance(rule_conditions, list) or not rule_conditions:
            return True

        # Results for each condition or sub-group
        results = []
        
        for cond in rule_conditions:
            if 'conditions' in cond:
                # Nested group
                results.append(self._check_conditions(cond, objects_to_check))
            else:
                # Simple condition
                path = cond.get('path')
                op = cond.get('op', '==')
                target_val = cond.get('value')
                
                condition_met = False
                for obj in objects_to_check:
                    actual_val = self._get_nested_value(obj, path)
                    if self._check_op(actual_val, op, target_val):
                        condition_met = True
                        break
                results.append(condition_met)

        if logical_op == 'OR':
            return any(results)
        else: # Default AND
            return all(results)

    def _matches_rule(self, rule: Dict[str, Any], data: Dict[str, Any], is_edge: bool = False) -> tuple[bool, List[Dict[str, Any]]]:
        """Checks if a node or edge matches all conditions in a rule (AND logic). 
        Returns (match_status, [relevant_cim_objects]).
        """
        # 1. Type-based early exit (Legacy Filters)
        if is_edge:
            allowed_edge_types = rule.get('match_edge_types')
            if allowed_edge_types:
                if isinstance(allowed_edge_types, str): allowed_edge_types = json.loads(allowed_edge_types)
                if data.get('edge_type') not in allowed_edge_types: return False, []
        else:
            allowed_equip = rule.get('match_equipment')
            if allowed_equip:
                if isinstance(allowed_equip, str): allowed_equip = json.loads(allowed_equip)
                attached = data.get('attached_equipment', [])
                if not any(e.get('type') in allowed_equip for e in attached): return False, []

        # 2. Structured Condition Match
        conditions_json = rule.get('match_conditions', {})
        if isinstance(conditions_json, str):
            try: 
                conditions_json = json.loads(conditions_json)
            except: 
                conditions_json = {}

        target_class = conditions_json.get('target_class')
        
        # Determine the specific objects we are evaluating conditions against
        objects_to_check = []
        if is_edge:
            # For edges, the root object 'data' IS the equipment
            if not target_class or data.get('edge_type') == target_class:
                objects_to_check = [data]
        else:
            # For nodes, we check the attached equipment matching the target_class
            attached = data.get('attached_equipment', [])
            if target_class:
                # Check both 'type' and 'cim_class' as they vary between entry points
                objects_to_check = [
                    e for e in attached 
                    if e.get('type') == target_class or e.get('cim_class') == target_class
                ]
            else:
                # If no target_class, check conditions against the node itself OR any attached equipment
                objects_to_check = [data] + attached

        if not objects_to_check:
            return False, []

        # Evaluate recursive conditions
        if not self._check_conditions(conditions_json, objects_to_check):
            return False, []

        # 3. Legacy Property Match (match_has_property)
        req_props = rule.get('match_has_property')
        if req_props:
            if isinstance(req_props, str): req_props = json.loads(req_props)
            node_props = data.get('properties', {})
            for key, val in req_props.items():
                if node_props.get(key) != val and data.get(key) != val:
                    return False, []

        return True, objects_to_check
