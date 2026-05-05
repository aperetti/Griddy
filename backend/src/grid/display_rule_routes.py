import sqlite3
import json
from fastapi import APIRouter, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from src.shared.dependencies import RULES_DB_PATH, display_engine
from src.grid.sprites import generator as sprite_generator
from src.shared.auth import get_current_username
from fastapi import Depends

router = APIRouter(prefix="/api/display-rules", tags=["display-rules"])

# ── Models ────────────────────────────────────────────────────────
class RuleTestRequest(BaseModel):
    match_conditions: Dict[str, Any]
    target_class: str

class DisplayConfigBase(BaseModel):
    name: str
    description: Optional[str] = ""

class DisplayRuleBase(BaseModel):
    name: str
    priority: int = 0
    match_conditions: Dict[str, Any]
    config: Dict[str, Any]
    enabled: bool = True

# ── Helpers ───────────────────────────────────────────────────────
def _get_conn():
    # Writable connection for management routes
    conn = sqlite3.connect(RULES_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ── Management Routes ─────────────────────────────────────────────

@router.get("/configs")
async def list_display_profiles(username: str = Depends(get_current_username)):
    """Returns all display profiles."""
    def _list():
        with _get_conn() as conn:
            rows = conn.execute("""
                SELECT c.*, 
                (SELECT COUNT(*) FROM display_config_rules WHERE config_id = c.id) as rules_count
                FROM display_configs c
                ORDER BY is_default DESC, name ASC
            """).fetchall()
            return [dict(r) for r in rows]
    return await run_in_threadpool(_list)

@router.post("/configs")
async def create_display_profile(config: DisplayConfigBase, username: str = Depends(get_current_username)):
    """Creates a new display profile."""
    def _create():
        with _get_conn() as conn:
            cursor = conn.execute(
                "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)",
                (config.name, config.description)
            )
            config_id = cursor.lastrow_id
            conn.commit()
            row = conn.execute("SELECT * FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            return dict(row)
    return await run_in_threadpool(_create)

@router.put("/configs/{config_id}")
async def update_display_profile(config_id: int, config: DisplayConfigBase, username: str = Depends(get_current_username)):
    """Updates profile metadata."""
    def _update():
        with _get_conn() as conn:
            cursor = conn.execute(
                "UPDATE display_configs SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (config.name, config.description, config_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
            conn.commit()
            row = conn.execute("SELECT * FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            return dict(row)
    return await run_in_threadpool(_update)

@router.delete("/configs/{config_id}")
async def delete_display_profile(config_id: int, username: str = Depends(get_current_username)):
    """Deletes a display profile."""
    def _delete():
        with _get_conn() as conn:
            # Check if default
            row = conn.execute("SELECT is_default FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            if row['is_default']:
                raise HTTPException(status_code=400, detail="Cannot delete the default profile")
            
            conn.execute("DELETE FROM display_configs WHERE id = ?", (config_id,))
            conn.commit()
            return {"success": True}
    return await run_in_threadpool(_delete)

@router.put("/configs/{config_id}/set-default")
async def set_default_profile(config_id: int, username: str = Depends(get_current_username)):
    """Sets a profile as the system default."""
    def _set():
        with _get_conn() as conn:
            conn.execute("BEGIN TRANSACTION")
            try:
                conn.execute("UPDATE display_configs SET is_default = 0")
                cursor = conn.execute("UPDATE display_configs SET is_default = 1 WHERE id = ?", (config_id,))
                if cursor.rowcount == 0:
                    conn.execute("ROLLBACK")
                    raise HTTPException(status_code=404, detail="Profile not found")
                conn.commit()
                # Trigger engine reload
                display_engine.load_rules()
                return {"success": True}
            except Exception as e:
                conn.execute("ROLLBACK")
                raise e
    return await run_in_threadpool(_set)

@router.get("/configs/{config_id}/rules")
async def get_profile_rules(config_id: int, username: str = Depends(get_current_username)):
    """Returns rules for a specific profile."""
    def _get():
        with _get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM display_config_rules WHERE config_id = ? ORDER BY priority DESC, name ASC",
                (config_id,)
            ).fetchall()
            result = []
            for r in rows:
                rd = dict(r)
                try:
                    rd['match_conditions'] = json.loads(rd['match_conditions']) if rd.get('match_conditions') else {}
                    rd['config'] = json.loads(rd['config']) if rd.get('config') else {}
                except: pass
                result.append(rd)
            return result
    return await run_in_threadpool(_get)

@router.post("/configs/{config_id}/rules")
async def create_rule(config_id: int, rule: DisplayRuleBase, username: str = Depends(get_current_username)):
    """Adds a new rule to a profile."""
    def _create():
        with _get_conn() as conn:
            cursor = conn.execute(
                """INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (config_id, rule.name, rule.priority, json.dumps(rule.match_conditions), json.dumps(rule.config), 1 if rule.enabled else 0)
            )
            new_id = cursor.lastrow_id
            conn.commit()
            display_engine.load_rules()
            row = conn.execute("SELECT * FROM display_config_rules WHERE id = ?", (new_id,)).fetchone()
            rd = dict(row)
            rd['match_conditions'] = json.loads(rd['match_conditions'])
            rd['config'] = json.loads(rd['config'])
            return rd
    return await run_in_threadpool(_create)

@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, rule: DisplayRuleBase, username: str = Depends(get_current_username)):
    """Updates an existing rule."""
    def _update():
        with _get_conn() as conn:
            cursor = conn.execute(
                """UPDATE display_config_rules 
                   SET name = ?, priority = ?, match_conditions = ?, config = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (rule.name, rule.priority, json.dumps(rule.match_conditions), json.dumps(rule.config), 1 if rule.enabled else 0, rule_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Rule not found")
            conn.commit()
            display_engine.load_rules()
            row = conn.execute("SELECT * FROM display_config_rules WHERE id = ?", (rule_id,)).fetchone()
            rd = dict(row)
            rd['match_conditions'] = json.loads(rd['match_conditions'])
            rd['config'] = json.loads(rd['config'])
            return rd
    return await run_in_threadpool(_update)

@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, username: str = Depends(get_current_username)):
    """Deletes a rule."""
    def _delete():
        with _get_conn() as conn:
            conn.execute("DELETE FROM display_config_rules WHERE id = ?", (rule_id,))
            conn.commit()
            display_engine.load_rules()
            return {"success": True}
    return await run_in_threadpool(_delete)

@router.post("/rules/{rule_id}/duplicate")
async def duplicate_rule(rule_id: int, username: str = Depends(get_current_username)):
    """Duplicates an existing rule."""
    def _dup():
        with _get_conn() as conn:
            row = conn.execute("SELECT * FROM display_config_rules WHERE id = ?", (rule_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Rule not found")
            
            cursor = conn.execute(
                """INSERT INTO display_config_rules (config_id, name, priority, match_conditions, config, enabled)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (row['config_id'], f"{row['name']} (Copy)", row['priority'], row['match_conditions'], row['config'], row['enabled'])
            )
            new_id = cursor.lastrow_id
            conn.commit()
            display_engine.load_rules()
            return {"id": new_id, "name": f"{row['name']} (Copy)"}
    return await run_in_threadpool(_dup)

# ── Import/Export Routes ──────────────────────────────────────────

@router.get("/configs/{config_id}/export")
async def export_display_profile(config_id: int, username: str = Depends(get_current_username)):
    """Exports a profile and all its rules as a single JSON object."""
    def _export():
        with _get_conn() as conn:
            config = conn.execute("SELECT * FROM display_configs WHERE id = ?", (config_id,)).fetchone()
            if not config:
                raise HTTPException(status_code=404, detail="Profile not found")
            
            rules = conn.execute("SELECT * FROM display_config_rules WHERE config_id = ?", (config_id,)).fetchall()
            
            return {
                "profile": {
                    "name": config['name'],
                    "description": config['description']
                },
                "rules": [
                    {
                        "name": r['name'],
                        "priority": r['priority'],
                        "match_conditions": json.loads(r['match_conditions']),
                        "config": json.loads(r['config']),
                        "enabled": bool(r['enabled'])
                    } for r in rules
                ]
            }
    return await run_in_threadpool(_export)

@router.post("/configs/import")
async def import_display_profile(data: Dict[str, Any], username: str = Depends(get_current_username)):
    """Imports a profile and its rules from a JSON object."""
    def _import():
        if not data.get('profile') or not data.get('rules'):
            raise HTTPException(status_code=400, detail="Invalid import format. Expected 'profile' and 'rules' keys.")
        
        with _get_conn() as conn:
            conn.execute("BEGIN TRANSACTION")
            try:
                import datetime
                name = data['profile']['name']
                # Check for collisions
                existing = conn.execute("SELECT id FROM display_configs WHERE name = ?", (name,)).fetchone()
                if existing:
                    name = f"{name} (Imported {datetime.date.today().isoformat()})"
                
                cursor = conn.execute(
                    "INSERT INTO display_configs (name, description, is_default) VALUES (?, ?, 0)",
                    (name, data['profile'].get('description', ''))
                )
                config_id = cursor.lastrow_id
                
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
                row = conn.execute("SELECT * FROM display_configs WHERE id = ?", (config_id,)).fetchone()
                return dict(row)
            except Exception as e:
                conn.execute("ROLLBACK")
                raise HTTPException(status_code=500, detail=str(e))
    return await run_in_threadpool(_import)

# ── Public / Read-Only Routes ─────────────────────────────────────

def _get_read_conn():
    # Enforce Read-Only mode for public consumption
    conn = sqlite3.connect(f"file:{RULES_DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn

# ── Routes ────────────────────────────────────────────────────────

@router.get("/classifiers")
async def list_field_device_classifiers():
    """Return all registered FieldDevice classifiers for the rule editor.

    No authentication required — this is read-only static metadata.
    The frontend uses this to populate the 'Built-in Classifier' picker.
    """
    from src.shared.cim.classifiers import FIELD_DEVICE_CLASSIFIERS
    return [
        {
            "name": c.name,
            "derived_type": c.derived_type,
            "target_cim_class": c.target_cim_class,
            "description": c.description,
        }
        for c in FIELD_DEVICE_CLASSIFIERS
    ]


@router.get("/active")
async def get_active_display_rules():
    """Public endpoint: returns enabled rules for the default display config.

    No authentication required — rules are read-only display configuration
    consumed by the map for client-side classification.
    """
    def _load():
        with _get_read_conn() as conn:
            config = conn.execute(
                "SELECT id FROM display_configs WHERE is_default = 1 LIMIT 1"
            ).fetchone()
            if not config:
                return []
            rows = conn.execute(
                """SELECT id, priority, match_conditions, config
                   FROM display_config_rules
                   WHERE config_id = ? AND enabled = 1
                   ORDER BY priority DESC""",
                (config["id"],),
            ).fetchall()
            result = []
            for row in rows:
                try:
                    mc = json.loads(row["match_conditions"]) if isinstance(row["match_conditions"], str) else row["match_conditions"]
                    cfg = json.loads(row["config"]) if isinstance(row["config"], str) else row["config"]
                    result.append({"id": row["id"], "priority": row["priority"], "match_conditions": mc, "config": cfg})
                except Exception:
                    pass
            return result
    return await run_in_threadpool(_load)


@router.get("/profile/active")
async def get_active_config():
    """Returns the current active configuration profile and its rules."""
    def _get():
        with _get_read_conn() as conn:
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

        count_query = re.sub(r'RETURN\s+.*\s+as\s+mrid', 'RETURN count(*) as count', query, flags=re.IGNORECASE | re.DOTALL)

        match_count = 0
        mrids = []
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
                    # Execute counts and mrids
                    # We limit mrids to 1000 for diagnostic purposes to avoid huge payloads
                    mrid_query = query + " LIMIT 1000"
                    res = session.run(mrid_query, **params)
                    for record in res:
                        if record["mrid"]:
                            mrids.append(record["mrid"])
                    
                    # Also get full count if list was truncated
                    count_res = session.run(count_query, **params)
                    row = count_res.single()
                    if row:
                        match_count = row["count"]
                driver.close()
            except Exception as e:
                warnings.append(f"Neo4j query error ({neo4j_url}, db={database}): {e}")

        return {
            "query": query,
            "params": params,
            "match_count": match_count,
            "mrids": mrids,
            "warnings": warnings
        }
        
    return await run_in_threadpool(_test)
