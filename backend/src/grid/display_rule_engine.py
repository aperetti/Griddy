import sqlite3
import json
import logging
import hashlib
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
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
        # Bulk classification cache: model_id -> classification_map
        # Populated lazily in classify_all; invalidated on load_rules().
        self._classify_cache: Dict[str, Dict[str, Any]] = {}
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
            # Enforce Read-Only mode for security
            conn = sqlite3.connect(f"file:{self.admin_db_path}?mode=ro", uri=True)
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
            self._classify_cache.clear()  # Invalidate bulk classification cache
        except Exception as e:
            logger.error(f"Error loading display rules: {e}")
            self._rules = []

    def classify_all(self, cim_manager: Any) -> Dict[str, Dict[str, Any]]:
        """
        Performs bulk classification of all equipment in the database based on the loaded rules.
        This uses Cypher queries to delegate matching to the Neo4j engine.

        Results are cached per model until load_rules() is called (i.e. until rules change).

        Returns:
            A mapping of equipment_mrid -> classification_dict
        """
        if not self._rules:
            return {}

        model_id = getattr(cim_manager, 'model_id', id(cim_manager))
        if model_id in self._classify_cache:
            logger.debug("classify_all: returning cached result for model %s", model_id)
            return self._classify_cache[model_id]

        builder = CypherRuleBuilder()
        
        # 1. Collect all queries to execute in parallel
        # We store (rule_id, is_base, override_idx) -> task
        tasks = []
        
        for rule in self._rules:
            try:
                conditions = rule.get('match_conditions', {})
                target_class = conditions.get('target_class')
                path_steps = conditions.get('path_steps')
                rule_mode = conditions.get('rule_mode', 'guided')

                if not target_class and not path_steps and rule_mode != 'custom_cypher':
                    continue

                effective_target = target_class or (
                    path_steps[-1]['class'] if path_steps else 'ConnectivityNode'
                )

                query, params, _ = builder.build_rule_query(conditions, effective_target)
                tasks.append({
                    "rule_id": rule['id'],
                    "is_base": True,
                    "query": query,
                    "params": params
                })
                
                config = rule.get('config', {})
                overrides_config = config.get('svg_overrides') or []
                if isinstance(overrides_config, str):
                    try: overrides_config = json.loads(overrides_config)
                    except: overrides_config = []
                
                for idx, ov in enumerate(overrides_config):
                    ov_conds = self._ensure_dict(ov.get('conditions'))
                    if not ov_conds: continue
                    
                    ov_path_steps = ov_conds.get('path_steps')
                    ov_target = ov_path_steps[-1]['class'] if ov_path_steps else (ov_conds.get('target_class') or effective_target)
                    
                    ov_query, ov_params, _ = builder.build_rule_query(ov_conds, ov_target)
                    tasks.append({
                        "rule_id": rule['id'],
                        "is_base": False,
                        "ov_idx": idx,
                        "query": ov_query,
                        "params": ov_params
                    })
            except Exception as e:
                logger.error("Error preparing queries for rule %s: %s", rule.get('id'), e)

        # 2. Execute all queries in parallel
        # results_map: (rule_id, is_base, ov_idx) -> MRID set or results list
        results_map = {}
        
        def execute_task(t):
            try:
                res = cim_manager.execute_cypher(t['query'], t['params'])
                if t['is_base']:
                    return (t['rule_id'], True, None, res)
                else:
                    mrid_set = {str(row['mrid']).upper() for row in res if row.get('mrid')}
                    return (t['rule_id'], False, t['ov_idx'], mrid_set)
            except Exception as e:
                logger.error("Parallel query failed: %s", e)
                return (t['rule_id'], t['is_base'], t.get('ov_idx'), set() if not t['is_base'] else [])

        with ThreadPoolExecutor(max_workers=10) as executor:
            for rid, is_base, ov_idx, data in executor.map(execute_task, tasks):
                results_map[(rid, is_base, ov_idx)] = data

        # 3. Process results into classification_map
        classification_map = {}
        for rule in self._rules:
            rid = rule['id']
            base_results = results_map.get((rid, True, None), [])
            
            config = rule.get('config', {})
            overrides_config = config.get('svg_overrides') or []
            if isinstance(overrides_config, str):
                try: overrides_config = json.loads(overrides_config)
                except: overrides_config = []
            
            # Pre-calculate active override indices for each rule
            override_mrid_sets = []
            for idx in range(len(overrides_config)):
                override_mrid_sets.append(results_map.get((rid, False, idx)))

            for row in base_results:
                raw_mrid = row.get('mrid')
                if not raw_mrid: continue
                    
                mrid = str(raw_mrid).upper()
                if mrid not in classification_map:
                    active_overrides = []
                    for idx, ov_set in enumerate(override_mrid_sets):
                        if ov_set is not None and mrid in ov_set:
                            ov = overrides_config[idx]
                            active_overrides.append({
                                "icon": ov.get('icon') or ov.get('svg', ""),
                                "svg": ov.get('svg', ""),
                                "color_hex": ov.get('color_hex'),
                                "size": ov.get('size'),
                                "visual_type": ov.get('visual_type'),
                                "mode": ov.get('mode', "add"),
                                "line_weight": ov.get('line_weight'),
                                "line_style": ov.get('line_style'),
                                "center_icon_enabled": ov.get('center_icon_enabled', False),
                                "center_icon_size": ov.get('center_icon_size', 1.0),
                                "center_icon_rotate": ov.get('center_icon_rotate', False),
                            })

                    override_hash = self._calculate_override_hash(active_overrides)

                    def get_float(k, default):
                        try: return float(config.get(k, default))
                        except: return float(default)
                    
                    def get_int(k, default):
                        try: return int(config.get(k, default))
                        except: return int(default)

                    final_size = get_float('size', 1.0)
                    for o in active_overrides:
                        if o.get('size') is not None:
                            try: final_size = float(o['size'])
                            except: pass

                    tooltip_overrides = [
                        {"conditions": o.get("conditions", {}), "tooltip_config": o["tooltip_config"]}
                        for o in overrides_config if o.get("tooltip_config")
                    ] or None

                    classification_map[mrid] = {
                        "rule_id": rid,
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
                        "center_icon_enabled": bool(config.get('center_icon_enabled', False)),
                        "center_icon_size": get_float('center_icon_size', 1.0),
                        "center_icon_rotate": bool(config.get('center_icon_rotate', False)),
                        "line_weight": config.get('line_weight'),
                        "line_style": config.get('line_style'),
                        "svg_overrides": active_overrides,
                        "override_hash": override_hash,
                        "tooltip_config": config.get('tooltip_config'),
                        "tooltip_overrides": tooltip_overrides,
                    }

        self._classify_cache[model_id] = classification_map
        logger.info("classify_all: cached %d classifications for model %s", len(classification_map), model_id)
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
                                "mode": override.get('mode', "add"),
                                "line_weight": override.get('line_weight'),
                                "line_style": override.get('line_style'),
                                "center_icon_enabled": override.get('center_icon_enabled', False),
                                "center_icon_size": override.get('center_icon_size', 1.0),
                                "center_icon_rotate": override.get('center_icon_rotate', False),
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
                        "center_icon_enabled": bool(config.get('center_icon_enabled', False)),
                        "center_icon_size": get_float('center_icon_size', 1.0),
                        "center_icon_rotate": bool(config.get('center_icon_rotate', False)),
                        "line_weight": config.get('line_weight'),
                        "line_style": config.get('line_style'),
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
                                "mode": override.get('mode', "add"),
                                "line_weight": override.get('line_weight'),
                                "line_style": override.get('line_style'),
                                "center_icon_enabled": override.get('center_icon_enabled', False),
                                "center_icon_size": override.get('center_icon_size', 1.0),
                                "center_icon_rotate": override.get('center_icon_rotate', False),
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
                        "center_icon_enabled": bool(config.get('center_icon_enabled', False)),
                        "center_icon_size": get_float('center_icon_size', 1.0),
                        "center_icon_rotate": bool(config.get('center_icon_rotate', False)),
                        "line_weight": config.get('line_weight'),
                        "line_style": config.get('line_style'),
                        "svg_overrides": active_overrides,
                        "override_hash": override_hash,
                    }
            except Exception as e:
                logger.error("Error classifying edge %s with rule %s: %s", edge_data.get('mrid', 'unknown'), rule.get('id'), e)
        
        return None

    def _calculate_override_hash(self, overrides: List[Dict[str, Any]]) -> str:
        """Calculates a unique stable 8-char hash for a specific combination of overrides.
        Uses DJB2 on a simplified delimited string to ensure cross-language stability.
        """
        if not overrides:
            return ""
        
        # 1. Normalize and Sort
        normalized = []
        for o in overrides:
            # We only care about the visual impact: content and mode
            content = o.get('svg') or o.get('icon') or ''
            mode = o.get('mode', 'add')
            normalized.append(f"{content}|{mode}")
        
        normalized.sort()
        
        # 2. Hash the joined string
        combined_str = "||".join(normalized)
        
        hash_val = 5381
        for char in combined_str:
            hash_val = ((hash_val << 5) + hash_val) + ord(char)
        
        return hex(hash_val & 0xFFFFFFFF)[2:].zfill(8)

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
