import sqlite3
import json
from fastapi import APIRouter, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from src.shared.dependencies import ADMIN_SQLITE_PATH, display_engine
from src.grid.sprites import generator as sprite_generator
from src.shared.auth import get_current_username
from fastapi import Depends

router = APIRouter(prefix="/api/display-rules", tags=["display-rules"])

# ── Models ────────────────────────────────────────────────────────
class SVGOverride(BaseModel):
    conditions: Any = {}
    svg: str = ""
    mode: str = "add"

class RuleConfig(BaseModel):
    visual_type: str = "Custom"
    icon: Optional[str] = None
    color_hex: Optional[str] = None
    size: float = 1.0
    label: str = ""
    css_overrides: List[Any] = []
    svg_overrides: List[SVGOverride] = []
    radial_offset: float = 0.0
    cluster_enabled: bool = False
    cluster_radius: float = 40.0
    cluster_max_zoom: float = 20.0
    cluster_min_points: int = 2
    min_zoom: float = 0.0
    max_zoom: float = 24.0
    rotate_to_edge: bool = False

class RuleUpdate(BaseModel):
    name: str
    priority: int = 0
    match_conditions: Optional[Dict[str, Any]] = None
    enabled: bool = True
    config: RuleConfig = RuleConfig()

class DisplayConfigUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: bool = False

class RuleTestRequest(BaseModel):
    match_conditions: Dict[str, Any]
    target_class: str

# ── Helpers ───────────────────────────────────────────────────────
def _get_admin_conn():
    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ── Routes ────────────────────────────────────────────────────────
@router.get("/configs")
async def list_display_configs(username: str = Depends(get_current_username)):
    def _list():
        with _get_admin_conn() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM display_configs ORDER BY created_at DESC").fetchall()]
    return await run_in_threadpool(_list)

@router.post("/configs")
async def create_display_config(config: DisplayConfigUpdate, username: str = Depends(get_current_username)):
    def _create():
        with _get_admin_conn() as conn:
            cursor = conn.execute(
                "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, ?)",
                (config.name, config.description, 1 if config.is_default else 0)
            )
            config_id = cursor.lastrowid
            if config.is_default:
                conn.execute("UPDATE display_configs SET is_default = 0 WHERE id != ?", (config_id,))
            display_engine.load_rules()
            return {"id": config_id, **config.dict()}
    return await run_in_threadpool(_create)

@router.put("/configs/{config_id}/set-default")
async def set_default_config(config_id: int, username: str = Depends(get_current_username)):
    def _set():
        with _get_admin_conn() as conn:
            conn.execute("UPDATE display_configs SET is_default = 0")
            conn.execute("UPDATE display_configs SET is_default = 1 WHERE id = ?", (config_id,))
            display_engine.load_rules()
            return {"success": True}
    return await run_in_threadpool(_set)

@router.delete("/configs/{config_id}")
async def delete_display_config(config_id: int, username: str = Depends(get_current_username)):
    def _delete():
        with _get_admin_conn() as conn:
            # Check if it's the default
            row = conn.execute("SELECT is_default FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Config not found")
            
            if row['is_default']:
                 raise HTTPException(status_code=400, detail="Cannot delete the default profile")
            
            conn.execute("DELETE FROM display_configs WHERE id = ?", (config_id,))
            # display_config_rules has ON DELETE CASCADE in schema (from database_setup.py)
            return {"success": True}
    return await run_in_threadpool(_delete)

@router.get("/configs/{config_id}/rules")
async def list_config_rules(config_id: int, username: str = Depends(get_current_username)):
    def _list():
        with _get_admin_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM display_config_rules WHERE config_id = ? ORDER BY priority DESC",
                (config_id,)
            ).fetchall()
            results = []
            for row in rows:
                d = dict(row)
                if d.get('match_conditions'):
                    try: d['match_conditions'] = json.loads(d['match_conditions'])
                    except: d['match_conditions'] = {}
                
                if d.get('config'):
                    try: 
                        config_data = json.loads(d['config'])
                        # Flatten or keep nested? The frontend currently expects flat.
                        # Wait, the frontend refactor will expect nested.
                        d['config'] = config_data
                    except: 
                        d['config'] = {}
                else:
                    d['config'] = {}
                
                results.append(d)
            return results
    return await run_in_threadpool(_list)

@router.post("/configs/{config_id}/rules")
async def add_config_rule(config_id: int, rule: RuleUpdate, username: str = Depends(get_current_username)):
    def _add():
        with _get_admin_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO display_config_rules
                   (config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                (config_id, rule.name, rule.priority,
                 json.dumps(rule.match_conditions) if rule.match_conditions else None,
                 json.dumps(rule.config.dict()),
                 1 if rule.enabled else 0)
            )
            display_engine.load_rules()
            return {"id": cursor.lastrowid, "config_id": config_id, **rule.dict()}
    return await run_in_threadpool(_add)

@router.put("/rules/{rule_id}")
async def update_config_rule(rule_id: int, rule: RuleUpdate, username: str = Depends(get_current_username)):
    def _update():
        with _get_admin_conn() as conn:
            conn.execute(
                """UPDATE display_config_rules SET
                   name = ?, priority = ?, match_conditions = ?, config = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (rule.name, rule.priority,
                 json.dumps(rule.match_conditions) if rule.match_conditions else None,
                 json.dumps(rule.config.dict()),
                 1 if rule.enabled else 0, rule_id)
            )
            display_engine.load_rules()
            return {"id": rule_id, **rule.dict()}
    return await run_in_threadpool(_update)

@router.delete("/rules/{rule_id}")
async def delete_config_rule(rule_id: int, username: str = Depends(get_current_username)):
    def _delete():
        with _get_admin_conn() as conn:
            conn.execute("DELETE FROM display_config_rules WHERE id = ?", (rule_id,))
            display_engine.load_rules()
            return {"success": True}
    return await run_in_threadpool(_delete)

@router.post("/rules/{rule_id}/duplicate")
async def duplicate_config_rule(rule_id: int, username: str = Depends(get_current_username)):
    def _duplicate():
        with _get_admin_conn() as conn:
            # 1. Fetch existing rule
            old_rule = conn.execute("SELECT * FROM display_config_rules WHERE id = ?", (rule_id,)).fetchone()
            if not old_rule:
                raise HTTPException(status_code=404, detail="Rule not found")
            
            d = dict(old_rule)
            # 2. Insert new rule with modified name
            new_name = f"{d['name']} (Copy)"
            cursor = conn.execute(
                """INSERT INTO display_config_rules
                   (config_id, name, priority, match_conditions, config, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                (d['config_id'], new_name, d['priority'],
                 d['match_conditions'], d['config'], d['enabled'])
            )
            display_engine.load_rules()
            return {"id": cursor.lastrowid, "name": new_name}
    return await run_in_threadpool(_duplicate)

@router.get("/active")
async def get_active_config():
    """Returns the current active configuration profile and its rules."""
    def _get():
        with _get_admin_conn() as conn:
            config = conn.execute("SELECT * FROM display_configs WHERE is_default = 1 LIMIT 1").fetchone()
            if not config:
                return {"config": None, "rules": []}
            
            rules = conn.execute(
                "SELECT * FROM display_config_rules WHERE config_id = ? AND enabled = 1 ORDER BY priority DESC",
                (config['id'],)
            ).fetchall()
            
            rule_list = []
            for r in rules:
                rd = dict(r)
                if rd.get('match_conditions'):
                    try: rd['match_conditions'] = json.loads(rd['match_conditions'])
                    except: rd['match_conditions'] = {}
                
                if rd.get('config'):
                    try: rd['config'] = json.loads(rd['config'])
                    except: rd['config'] = {}
                else:
                    rd['config'] = {}
                    
                rule_list.append(rd)
                
            return {
                "config": dict(config),
                "rules": rule_list
            }
    return await run_in_threadpool(_get)

# ── Sprite Map Routes ──────────────────────────────────────────────

@router.get("/sprites/map.png")
async def get_sprite_map_png():
    """Generate and return the sprite sheet PNG."""
    def _generate():
        try:
            png_bytes, _ = sprite_generator.generate()
            return png_bytes
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Sprite generation failed: {str(e)}")
            
    content = await run_in_threadpool(_generate)
    return Response(
        content=content, 
        media_type="image/png",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.get("/sprites/map.json")
async def get_sprite_map_json():
    """Generate and return the sprite mapping JSON."""
    def _generate():
        try:
            _, mapping = sprite_generator.generate()
            return mapping
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Sprite mapping generation failed: {str(e)}")
            
    content = await run_in_threadpool(_generate)
    return Response(
        content=json.dumps(content),
        media_type="application/json",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

@router.post("/test")
async def test_display_rule(request: RuleTestRequest, username: str = Depends(get_current_username)):
    """
    Diagnostic endpoint to test a rule's matching logic without saving.
    Returns the generated Cypher query and match count.
    """
    from src.grid.cypher_builder import CypherRuleBuilder
    from src.shared.dependencies import registry
    
    def _test():
        import re, os
        from neo4j import GraphDatabase

        builder = CypherRuleBuilder()
        query, params, warnings = builder.build_rule_query(request.match_conditions, request.target_class)

        count_query = re.sub(r'RETURN\s+.*\s+as\s+mrid$', 'RETURN count(n) as count', query, flags=re.IGNORECASE)

        match_count = 0
        neo4j_url = os.getenv("CIMG_URL")
        if not neo4j_url:
            warnings.append("CIMG_URL is not set — cannot execute query against Neo4j.")
        else:
            username = os.getenv("CIMG_USERNAME", "neo4j")
            password = os.getenv("CIMG_PASSWORD", "")
            database = os.getenv("CIMG_DATABASE", "neo4j")
            try:
                driver = GraphDatabase.driver(neo4j_url, auth=(username, password))
                with driver.session(database=database) as session:
                    result = session.run(count_query, **params)
                    row = result.single()
                    if row:
                        match_count = row["count"]
                driver.close()
            except Exception as e:
                warnings.append(f"Neo4j query error ({neo4j_url}, db={database}): {e}")

        return {
            "query": query,
            "params": params,
            "match_count": match_count,
            "warnings": warnings
        }
        
    return await run_in_threadpool(_test)
