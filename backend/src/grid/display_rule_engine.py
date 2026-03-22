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
                WHERE config_id = ? 
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
                
                # Parse css_overrides JSON: [{"conditions": {...}, "css": "..."}]
                try:
                    rule['css_overrides'] = json.loads(rule['css_overrides']) if rule.get('css_overrides') else []
                except:
                    rule['css_overrides'] = []
                
                # Ensure size and label have safe defaults if missing from DB
                rule['size'] = rule.get('size', 1.0)
                rule['label'] = rule.get('label', "")
                rule['radial_offset'] = rule.get('radial_offset', 0.0)
                
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
                # Evaluate CSS overrides
                active_css = []
                for override in rule.get('css_overrides', []):
                    if self._check_conditions(override.get('conditions', {}), objects_to_check):
                        active_css.append(override.get('css', ""))
                
                return {
                    "visual_type": rule['visual_type'],
                    "size": rule.get('size', 1.0),
                    "label": rule.get('label', ""),
                    "icon": rule.get('icon'),
                    "color_hex": rule.get('color_hex'),
                    "radial_offset": rule.get('radial_offset', 0.0),
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
                # Evaluate CSS overrides
                active_css = []
                for override in rule.get('css_overrides', []):
                    if self._check_conditions(override.get('conditions', {}), objects_to_check):
                        active_css.append(override.get('css', ""))
                        
                return {
                    "visual_type": rule['visual_type'],
                    "size": rule.get('size', 1.0),
                    "label": rule.get('label', ""),
                    "icon": rule.get('icon'),
                    "color_hex": rule.get('color_hex'),
                    "radial_offset": rule.get('radial_offset', 0.0),
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
            if op == '>' : return actual_val > target_val
            if op == '<' : return actual_val < target_val
            if op == '>=': return actual_val >= target_val
            if op == '<=': return actual_val <= target_val
            if op == 'contains': return isinstance(actual_val, str) and target_val in actual_val
            if op == 'length_gt': 
                return (isinstance(actual_val, (list, dict, str)) and len(actual_val) > int(target_val))
        except:
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

        logical_op = conditions_json.get('logical_op', 'AND').upper()
        rule_conditions = conditions_json.get('conditions', [])
        
        if not rule_conditions:
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
                objects_to_check = [e for e in attached if e.get('type') == target_class]
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
