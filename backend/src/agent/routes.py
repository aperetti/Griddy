from fastapi import APIRouter, Depends
from src.agent.translate_nl_to_sql import AgentQueryProcessor
from src.shared.auth import get_current_username

router = APIRouter(prefix="/api/agent", tags=["agent"])

agent_processor = AgentQueryProcessor()

@router.post("/query")
async def process_agent_query(query: str, username: str = Depends(get_current_username)):
    """Translates NL to SQL or Graph queries."""
    result = agent_processor.process_query(query)
    return {"generated_prompt": result}
