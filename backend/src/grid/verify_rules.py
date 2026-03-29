import sys
import os

# Set up PYTHONPATH to include backend/src
sys.path.append(os.path.abspath('backend/src'))
sys.path.append(os.path.abspath('backend')) # For src imports

from grid.cim_rules import CimRuleEngine
from grid.cim_mapping import CimMapper

def test_rule_evaluation():
    engine = CimRuleEngine()
    mapper = CimMapper()
    
    # Simple direct logic
    data = {
        'cim_type': 'PowerTransformer',
        'ratedS': 500,
        'terminal': {'connectivityNode': {'mrid': 'node_123'}}
    }
    
    # 1. Nesting / Mapping
    mapped = mapper.map_node(data)
    
    # 2. Simple condition
    cond_1 = {'path': 'ratedS', 'op': '>', 'value': 400}
    assert engine.evaluate_condition(cond_1, mapped) == True
    
    # 3. Nested path
    cond_2 = {'path': 'terminal.connectivityNode.mrid', 'op': '==', 'value': 'node_123'}
    assert engine.evaluate_condition(cond_2, mapped) == True
    
    # 4. Group logic (OR)
    group_or = {
        'logical_op': 'OR',
        'conditions': [
            {'path': 'ratedS', 'op': '<', 'value': 100},
            {'path': 'cim_type', 'op': '==', 'value': 'PowerTransformer'}
        ]
    }
    assert engine.evaluate_group(group_or, mapped) == True
    
    # 5. Group logic (AND)
    group_and = {
        'logical_op': 'AND',
        'conditions': [
            {'path': 'ratedS', 'op': '>', 'value': 400},
            {'path': 'cim_type', 'op': '==', 'value': 'PowerTransformer'}
        ]
    }
    assert engine.evaluate_group(group_and, mapped) == True
    
    print("✅ Logic Verification Success: CimRuleEngine correctly handles mapping, nested paths, and groups.")

if __name__ == "__main__":
    test_rule_evaluation()
