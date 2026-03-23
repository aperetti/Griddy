import sqlite3
import json
from fastapi import APIRouter, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from src.shared.dependencies import ADMIN_SQLITE_PATH, display_engine
from src.grid.sprites import generator as sprite_generator

router = APIRouter(prefix="/api/display-rules", tags=["display-rules"])

# ── Models ────────────────────────────────────────────────────────
class DisplayConfigUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    is_default: Optional[bool] = False

class RuleUpdate(BaseModel):
    name: str
    visual_type: str
    priority: int = 0
    match_conditions: Optional[Dict[str, Any]] = None
    icon: Optional[str] = None
    color_hex: Optional[str] = None
    size: Optional[float] = 1.0
    label: Optional[str] = ""
    cluster_enabled: Optional[bool] = False
    cluster_radius: Optional[float] = 40.0
    cluster_max_zoom: Optional[float] = 20.0
    cluster_min_points: Optional[int] = 2
    min_zoom: Optional[float] = 0.0
    max_zoom: Optional[float] = 24.0
    css_overrides: Optional[List[Any]] = []
    enabled: bool = True

# ── Helpers ───────────────────────────────────────────────────────
def _get_admin_conn():
    conn = sqlite3.connect(ADMIN_SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ── Routes ────────────────────────────────────────────────────────
@router.get("/configs")
async def list_display_configs():
    def _list():
        with _get_admin_conn() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM display_configs ORDER BY created_at DESC").fetchall()]
    return await run_in_threadpool(_list)

@router.post("/configs")
async def create_display_config(config: DisplayConfigUpdate):
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
async def set_default_config(config_id: int):
    def _set():
        with _get_admin_conn() as conn:
            conn.execute("UPDATE display_configs SET is_default = 0")
            conn.execute("UPDATE display_configs SET is_default = 1 WHERE id = ?", (config_id,))
            display_engine.load_rules()
            return {"success": True}
    return await run_in_threadpool(_set)

@router.get("/configs/{config_id}/rules")
async def list_config_rules(config_id: int):
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
                    except: pass
                # css_overrides is now stored as a string, so parse it
                if d.get('css_overrides'):
                    try: d['css_overrides'] = json.loads(d['css_overrides'])
                    except: pass
                results.append(d)
            return results
    return await run_in_threadpool(_list)

@router.post("/configs/{config_id}/rules")
async def add_config_rule(config_id: int, rule: RuleUpdate):
    def _add():
        with _get_admin_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO display_config_rules
                   (config_id, name, visual_type, priority, match_conditions, icon, color_hex, size, label,
                    cluster_enabled, cluster_radius, cluster_max_zoom, cluster_min_points,
                    min_zoom, max_zoom,
                    css_overrides, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                (config_id, rule.name, rule.visual_type, rule.priority,
                 json.dumps(rule.match_conditions) if rule.match_conditions else None,
                 rule.icon, rule.color_hex, rule.size, rule.label,
                 1 if rule.cluster_enabled else 0, rule.cluster_radius, rule.cluster_max_zoom, rule.cluster_min_points,
                 rule.min_zoom, rule.max_zoom,
                 json.dumps(rule.css_overrides) if rule.css_overrides is not None else "[]",
                 1 if rule.enabled else 0)
            )
            display_engine.load_rules()
            return {"id": cursor.lastrowid, "config_id": config_id, **rule.dict()}
    return await run_in_threadpool(_add)

@router.put("/rules/{rule_id}")
async def update_config_rule(rule_id: int, rule: RuleUpdate):
    def _update():
        with _get_admin_conn() as conn:
            conn.execute(
                """UPDATE display_config_rules SET
                   name = ?, visual_type = ?, priority = ?, match_conditions = ?, icon = ?, color_hex = ?,
                   size = ?, label = ?,
                   cluster_enabled = ?, cluster_radius = ?, cluster_max_zoom = ?, cluster_min_points = ?,
                   min_zoom = ?, max_zoom = ?,
                   css_overrides = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (rule.name, rule.visual_type, rule.priority,
                 json.dumps(rule.match_conditions) if rule.match_conditions else None,
                 rule.icon, rule.color_hex, rule.size, rule.label,
                 1 if rule.cluster_enabled else 0, rule.cluster_radius, rule.cluster_max_zoom, rule.cluster_min_points,
                 rule.min_zoom, rule.max_zoom,
                 json.dumps(rule.css_overrides) if rule.css_overrides is not None else "[]",
                 1 if rule.enabled else 0, rule_id)
            )
            display_engine.load_rules()
            return {"id": rule_id, **rule.dict()}
    return await run_in_threadpool(_update)

@router.delete("/rules/{rule_id}")
async def delete_config_rule(rule_id: int):
    def _delete():
        with _get_admin_conn() as conn:
            conn.execute("DELETE FROM display_config_rules WHERE id = ?", (rule_id,))
            display_engine.load_rules()
            return {"success": True}
    return await run_in_threadpool(_delete)

@router.post("/rules/{rule_id}/duplicate")
async def duplicate_config_rule(rule_id: int):
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
                   (config_id, name, visual_type, priority, match_conditions, icon, color_hex, size, label,
                    cluster_enabled, cluster_radius, cluster_max_zoom, cluster_min_points,
                    min_zoom, max_zoom,
                    css_overrides, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                (d['config_id'], new_name, d['visual_type'], d['priority'],
                 d['match_conditions'], d['icon'], d['color_hex'], d['size'], d['label'],
                 d['cluster_enabled'], d['cluster_radius'], d['cluster_max_zoom'], d['cluster_min_points'],
                 d['min_zoom'], d['max_zoom'],
                 d['css_overrides'], d['enabled'])
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
                    except: pass
                if rd.get('css_overrides'):
                    try: rd['css_overrides'] = json.loads(rd['css_overrides'])
                    except: pass
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
    return Response(content=content, media_type="image/png")

@router.get("/sprites/map.json")
async def get_sprite_map_json():
    """Generate and return the sprite mapping JSON."""
    def _generate():
        try:
            _, mapping = sprite_generator.generate()
            return mapping
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Sprite mapping generation failed: {str(e)}")
            
    return await run_in_threadpool(_generate)
