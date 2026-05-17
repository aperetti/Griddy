import sqlite3
import json
from fastapi import APIRouter, HTTPException, Response
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from src.shared.dependencies import display_rule_repo, display_engine
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

# ── Management Routes ─────────────────────────────────────────────

@router.get("/configs")
async def list_display_profiles(username: str = Depends(get_current_username)):
    """Returns all display profiles."""
    return await run_in_threadpool(display_rule_repo.list_configs)

@router.post("/configs")
async def create_display_profile(config: DisplayConfigBase, username: str = Depends(get_current_username)):
    """Creates a new display profile."""
    return await run_in_threadpool(display_rule_repo.create_config, config.name, config.description)

@router.put("/configs/{config_id}")
async def update_display_profile(config_id: int, config: DisplayConfigBase, username: str = Depends(get_current_username)):
    """Updates profile metadata."""
    res = await run_in_threadpool(display_rule_repo.update_config, config_id, config.name, config.description)
    if not res:
        raise HTTPException(status_code=404, detail="Profile not found")
    return res

@router.delete("/configs/{config_id}")
async def delete_display_profile(config_id: int, username: str = Depends(get_current_username)):
    """Deletes a display profile."""
    def _delete():
        row = display_rule_repo.get_config(config_id)
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        if row['is_default']:
            raise HTTPException(status_code=400, detail="Cannot delete the default profile")
        
        display_rule_repo.delete_config(config_id)
        return {"success": True}
    return await run_in_threadpool(_delete)

@router.put("/configs/{config_id}/set-default")
async def set_default_profile(config_id: int, username: str = Depends(get_current_username)):
    """Sets a profile as the system default."""
    def _set():
        success = display_rule_repo.set_default_config(config_id)
        if not success:
            raise HTTPException(status_code=404, detail="Profile not found")
        # Trigger engine reload
        display_engine.load_rules()
        return {"success": True}
    return await run_in_threadpool(_set)

@router.get("/configs/{config_id}/rules")
async def get_profile_rules(config_id: int, username: str = Depends(get_current_username)):
    """Returns rules for a specific profile."""
    return await run_in_threadpool(display_rule_repo.list_rules, config_id)

@router.post("/configs/{config_id}/rules")
async def create_rule(config_id: int, rule: DisplayRuleBase, username: str = Depends(get_current_username)):
    """Adds a new rule to a profile."""
    def _create():
        res = display_rule_repo.create_rule(config_id, rule.model_dump())
        display_engine.load_rules()
        return res
    return await run_in_threadpool(_create)

@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, rule: DisplayRuleBase, username: str = Depends(get_current_username)):
    """Updates an existing rule."""
    def _update():
        res = display_rule_repo.update_rule(rule_id, rule.model_dump())
        if not res:
            raise HTTPException(status_code=404, detail="Rule not found")
        display_engine.load_rules()
        return res
    return await run_in_threadpool(_update)

@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: int, username: str = Depends(get_current_username)):
    """Deletes a rule."""
    def _delete():
        display_rule_repo.delete_rule(rule_id)
        display_engine.load_rules()
        return {"success": True}
    return await run_in_threadpool(_delete)

@router.post("/rules/{rule_id}/duplicate")
async def duplicate_rule(rule_id: int, username: str = Depends(get_current_username)):
    """Duplicates an existing rule."""
    def _dup():
        res = display_rule_repo.duplicate_rule(rule_id)
        if not res:
            raise HTTPException(status_code=404, detail="Rule not found")
        display_engine.load_rules()
        return res
    return await run_in_threadpool(_dup)

# ── Import/Export Routes ──────────────────────────────────────────

@router.get("/configs/{config_id}/export")
async def export_display_profile(config_id: int, username: str = Depends(get_current_username)):
    """Exports a profile and all its rules as a single JSON object."""
    def _export():
        config = display_rule_repo.get_config(config_id)
        if not config:
            raise HTTPException(status_code=404, detail="Profile not found")
        
        rules = display_rule_repo.list_rules(config_id)
        
        return {
            "profile": {
                "name": config['name'],
                "description": config['description']
            },
            "rules": [
                {
                    "name": r['name'],
                    "priority": r['priority'],
                    "match_conditions": r['match_conditions'],
                    "config": r['config'],
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
        
        try:
            return display_rule_repo.import_config(data)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return await run_in_threadpool(_import)

# ── Public / Read-Only Routes ─────────────────────────────────────

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
        active = display_rule_repo.get_active_config_with_rules()
        rules = active.get('rules', [])
        return [
            {"id": r["id"], "priority": r["priority"], "match_conditions": r["match_conditions"], "config": r["config"]}
            for r in rules
        ]
    return await run_in_threadpool(_load)


@router.get("/profile/active")
async def get_active_config():
    """Returns the current active configuration profile and its rules."""
    return await run_in_threadpool(display_rule_repo.get_active_config_with_rules)


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
