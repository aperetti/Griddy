from fastapi import APIRouter
from src.agent.translate_nl_to_sql import AgentQueryProcessor

router = APIRouter(prefix="/api/agent", tags=["agent"])

agent_processor = AgentQueryProcessor()

@router.post("/query")
async def process_agent_query(query: str):
    """Translates NL to SQL or Graph queries."""
    result = agent_processor.process_query(query)
    return {"generated_prompt": result}
