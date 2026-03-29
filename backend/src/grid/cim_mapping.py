from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class CimMapper:
    """Mapper for converting raw CIM/DB nodes into standard display formats."""
    
    VIRTUAL_PROPERTIES = {
        'PowerTransformer': ['ratedS', 'r', 'x', 'g', 'b'],
        'EnergyConsumer': ['p', 'q'],
        'ACLineSegment': ['length', 'r', 'x', 'bch']
    }

    def map_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """Maps a raw node from Neo4j/DuckDB to a standard rule-evaluable dictionary."""
        mapped = node.copy()
        cim_type = node.get('cim_type') or node.get('type')
        
        # Performance: Pre-calculate virtuals if they are in the JSON data but not flat
        # Some integrations store attributes in a 'data' or 'attributes' field
        data_field = node.get('data') or node.get('attributes')
        if isinstance(data_field, dict):
            mapped.update(data_field)
            
        return mapped

    def get_display_label(self, node: Dict[str, Any], label_template: str) -> str:
        """Resolves label templates like 'Transformer: {name} ({ratedS}kVA)'."""
        import re
        
        def _replace(match):
            path = match.group(1)
            # Use dot notation resolution if needed
            from src.grid.cim_rules import CimRuleEngine
            engine = CimRuleEngine()
            val = engine._get_nested_value(node, path)
            return str(val) if val is not None else ''

        return re.sub(r'\{([^}]+)\}', _replace, label_template)
