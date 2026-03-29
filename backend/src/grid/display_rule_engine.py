import sqlite3
import json
import logging
import hashlib
from typing import List, Dict, Any, Optional
from src.grid.cypher_builder import CypherRuleBuilder
from .cim_rules import CimRuleEngine
from .cim_mapping import CimMapper

logger = logging.getLogger(__name__)

class DisplayRuleEngine:
    """Engine for classifying nodes based on admin-defined display rules."""

    def __init__(self, admin_db_path: str):
        self.admin_db_path = admin_db_path
        self._rules = []
        self._config_name = "None"
        self._engine = CimRuleEngine()
        self._mapper = CimMapper()
        self.load_rules()

    def _ensure_dict(self, val: Any) -> Dict[str, Any]:
        """Safely ensure a value is a dictionary, parsing JSON if necessary."""
        if not val:
            return {}
        if isinstance(val, dict):
            return val
        if isinstance(val, str):
            try:
                # Handle cases where SQLite or certain drivers return stringified JSON
                parsed = json.loads(val)
                return parsed if isinstance(parsed, dict) else {}
            except (json.JSONDecodeError, TypeError):
                logger.warning("Failed to parse JSON string for rule field: %s", val[:100])
                return {}
        return {}

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
                # Parse conditions and config using robust helper
                rule['match_conditions'] = self._ensure_dict(rule.get('match_conditions'))
                rule['config'] = self._ensure_dict(rule.get('config'))
                self._rules.append(rule)

            conn.close()
            logger.info(f"Loaded {len(self._rules)} display rules from config '{self._config_name}'")
        except Exception as e:
            logger.error(f"Error loading display rules: {e}")
            self._rules = []

    def classify_all(self, cim_manager: Any) -> Dict[str, Dict[str, Any]]:
        """
        Performs bulk classification of all equipment in the database based on the loaded rules.
        This uses Cypher queries to delegate matching to the Neo4j engine.
        
        Returns:
            A mapping of equipment_mrid -> classification_dict
        """
        if not self._rules:
            return {}

        builder = CypherRuleBuilder()
        classification_map = {}

        # self._rules is sorted by priority DESC (highest first)
        for rule in self._rules:
            try:
                config = rule.get('config', {})
                conditions = rule.get('match_conditions', {})
                target_class = conditions.get('target_class')

                if not target_class:
                    continue

                query, params = builder.build_rule_query(conditions, target_class)
                logger.debug("Executing bulk classification query for rule %s: %s", rule.get('id'), query)
                
                results = cim_manager.execute_cypher(query, params)
                
                for row in results:
                    mrid = row.get('mrid')
                    if mrid and mrid not in classification_map:
                        # Extract and cast config values
                        def get_float(k, default):
                            try: return float(config.get(k, default))
                            except: return float(default)
                        
                        def get_int(k, default):
                            try: return int(config.get(k, default))
                            except: return int(default)

                        classification_map[mrid] = {
                            "rule_id": rule.get('id'),
                            "visual_type": config.get('visual_type', 'Custom'),
                            "size": get_float('size', 1.0),
                            "label": config.get('label', ""),
                            "icon": config.get('icon'),
                            "color_hex": config.get('color_hex'),
                            "radial_offset": get_float('radial_offset', 0.0),
                            "cluster_enabled": bool(config.get('cluster_enabled', False)),
                            "cluster_radius": get_float('cluster_radius', 40.0),
                            "cluster_max_zoom": get_float('cluster_max_zoom', 20.0),
                            "cluster_min_points": get_int('cluster_min_points', 2),
                            "min_zoom": get_float('min_zoom', 0.0),
                            "max_zoom": get_float('max_zoom', 24.0),
                            "rotate_to_edge": bool(config.get('rotate_to_edge', False)),
                            "svg_overrides": [], 
                            "override_hash": "",
                        }
            except Exception as e:
                logger.error("Error in bulk classification for rule %s: %s", rule.get('id'), e)

        return classification_map

    def classify_node(self, node_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Classifies a node based on rules. Returns a dict of the first match.
        """
        if not self._rules:
            return None

        for rule in self._rules:
            try:
                # Nodes can match on equipment type or properties
                match, objects_to_check = self._matches_rule(rule, node_data, is_edge=False)
                if match:
                    config = rule.get('config', {})
                    active_overrides = []
                    
                    # Evaluate SVG overrides
                    overrides = config.get('svg_overrides') or []
                    if isinstance(overrides, str):
                        try:
                            overrides = json.loads(overrides)
                        except:
                            overrides = []

                    for override in overrides:
                        override_cond = self._ensure_dict(override.get('conditions'))
                        if self._check_conditions(override_cond, objects_to_check):
                            active_overrides.append({
                                "icon": override.get('icon') or override.get('svg', ""),
                                "svg": override.get('svg', ""), 
                                "color_hex": override.get('color_hex'),
                                "size": override.get('size'),
                                "visual_type": override.get('visual_type'),
                                "mode": override.get('mode', "add")
                            })
                    
                    override_hash = self._calculate_override_hash(active_overrides)
                    
                    # Helper for casting
                    def get_float(k, default):
                        try: return float(config.get(k, default))
                        except: return float(default)
                    
                    def get_int(k, default):
                        try: return int(config.get(k, default))
                        except: return int(default)

                    # Determine final size from config, potentially overridden
                    final_size = get_float('size', 1.0)
                    for o in active_overrides:
                        if o.get('size') is not None:
                            try: final_size = float(o['size'])
                            except: pass

                    return {
                        "rule_id": rule.get('id'),
                        "visual_type": config.get('visual_type', 'Custom'),
                        "size": final_size,
                        "label": config.get('label', ""),
                        "icon": config.get('icon'),
                        "color_hex": config.get('color_hex'),
                        "radial_offset": get_float('radial_offset', 0.0),
                        "cluster_enabled": bool(config.get('cluster_enabled', False)),
                        "cluster_radius": get_float('cluster_radius', 40.0),
                        "cluster_max_zoom": get_float('cluster_max_zoom', 20.0),
                        "cluster_min_points": get_int('cluster_min_points', 2),
                        "min_zoom": get_float('min_zoom', 0.0),
                        "max_zoom": get_float('max_zoom', 24.0),
                        "rotate_to_edge": bool(config.get('rotate_to_edge', False)),
                        "svg_overrides": active_overrides,
                        "override_hash": override_hash,
                    }
            except Exception as e:
                logger.error("Error classifying node %s with rule %s: %s", node_data.get('mrid', 'unknown'), rule.get('id'), e)
        
        return None

    def classify_edge(self, edge_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Classifies an edge based on rules. Returns a dict of the first match.
        """
        if not self._rules:
            return None

        for rule in self._rules:
            try:
                # Edges can match on edge_type or properties
                match, objects_to_check = self._matches_rule(rule, edge_data, is_edge=True)
                if match:
                    config = rule.get('config', {})
                    active_overrides = []
                    
                    # Evaluate SVG overrides
                    overrides = config.get('svg_overrides') or []
                    if isinstance(overrides, str):
                        try:
                            overrides = json.loads(overrides)
                        except:
                            overrides = []

                    for override in overrides:
                        override_cond = self._ensure_dict(override.get('conditions'))
                        if self._check_conditions(override_cond, objects_to_check):
                            active_overrides.append({
                                "icon": override.get('icon') or override.get('svg', ""),
                                "svg": override.get('svg', ""),
                                "color_hex": override.get('color_hex'),
                                "size": override.get('size'),
                                "visual_type": override.get('visual_type'),
                                "mode": override.get('mode', "add")
                            })
                    
                    override_hash = self._calculate_override_hash(active_overrides)
                    
                    # Helper for casting
                    def get_float(k, default):
                        try: return float(config.get(k, default))
                        except: return float(default)
                    
                    def get_int(k, default):
                        try: return int(config.get(k, default))
                        except: return int(default)

                    # Determine final size from config, potentially overridden
                    final_size = get_float('size', 1.0)
                    for o in active_overrides:
                        if o.get('size') is not None:
                            try: final_size = float(o['size'])
                            except: pass

                    return {
                        "rule_id": rule.get('id'),
                        "visual_type": config.get('visual_type', 'Custom'),
                        "size": final_size,
                        "label": config.get('label', ""),
                        "icon": config.get('icon'),
                        "color_hex": config.get('color_hex'),
                        "radial_offset": get_float('radial_offset', 0.0),
                        "cluster_enabled": bool(config.get('cluster_enabled', False)),
                        "cluster_radius": get_float('cluster_radius', 40.0),
                        "cluster_max_zoom": get_float('cluster_max_zoom', 20.0),
                        "cluster_min_points": get_int('cluster_min_points', 2),
                        "min_zoom": get_float('min_zoom', 0.0),
                        "max_zoom": get_float('max_zoom', 24.0),
                        "rotate_to_edge": bool(config.get('rotate_to_edge', False)),
                        "svg_overrides": active_overrides,
                        "override_hash": override_hash,
                    }
            except Exception as e:
                logger.error("Error classifying edge %s with rule %s: %s", edge_data.get('mrid', 'unknown'), rule.get('id'), e)
        
        return None

    def _calculate_override_hash(self, overrides: List[Dict[str, Any]]) -> str:
        """Calculates a unique 8-char hash for a specific combination of overrides."""
        if not overrides:
            return ""
        # Sort by SVG content to ensure deterministic hashing regardless of order
        # Sort by deterministic content to ensure stable hashing
        sorted_overrides = sorted(overrides, key=lambda x: f"{x.get('icon', '')}{x.get('svg', '')}{x.get('mode', '')}")
        override_str = json.dumps(sorted_overrides, sort_keys=True)
        return hashlib.md5(override_str.encode()).hexdigest()[:8]

        # Removed legacy internal condition checkers in favor of src/grid/cim_rules.py

    def _check_conditions(self, conditions_json: Dict[str, Any], objects_to_check: List[Dict[str, Any]]) -> bool:
        """Wrapper for rule evaluation using the CimRuleEngine."""
        if not conditions_json:
            return True
            
        for obj in objects_to_check:
            mapped = self._mapper.map_node(obj)
            if self._engine.evaluate_group(conditions_json, mapped):
                return True
        return False

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
        raw_objects = []
        if is_edge:
            # For edges, the root object 'data' IS the equipment
            if not target_class or data.get('edge_type') == target_class:
                raw_objects = [data]
        else:
            # For nodes, we check the attached equipment matching the target_class
            attached = data.get('attached_equipment', [])
            if target_class:
                # Check both 'type' and 'cim_class' as they vary between entry points
                raw_objects = [
                    e for e in attached 
                    if e.get('type') == target_class or e.get('cim_class') == target_class
                ]
            else:
                # If no target_class, check conditions against the node itself OR any attached equipment
                raw_objects = [data] + attached

        # Evaluate recursive conditions
        if not self._check_conditions(conditions_json, raw_objects):
            return False, []

        return True, raw_objects
