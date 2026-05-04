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

# ── Helpers ───────────────────────────────────────────────────────
def _get_admin_conn():
    # Enforce Read-Only mode for the Rules DB
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
        with _get_admin_conn() as conn:
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
