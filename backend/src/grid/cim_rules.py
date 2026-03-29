from typing import Dict, Any, List, Optional
import operator
import re

CIM_OPERATORS = {
    '==': operator.eq,
    '!=': operator.ne,
    '>': operator.gt,
    '<': operator.lt,
    '>=': operator.ge,
    '<=': operator.le,
    'contains': lambda a, b: str(b).lower() in str(a).lower() if a is not None else False,
    'regex': lambda a, b: bool(re.search(str(b), str(a))) if a is not None else False,
    'exists': lambda a, b: a is not None,
    'not_exists': lambda a, b: a is None
}

class CimRuleEngine:
    """Core logic for evaluating nested CIM display rules."""
    
    def evaluate_group(self, group: Dict[str, Any], data: Dict[str, Any]) -> bool:
        """Evaluates a group of conditions (recursive)."""
        if not group:
            return False
            
        logical_op = group.get('logical_op', 'AND')
        conditions = group.get('conditions', [])
        
        if not conditions:
            return True # Empty groups in AND are technically true
            
        results = []
        for cond in conditions:
            if 'logical_op' in cond:
                results.append(self.evaluate_group(cond, data))
            else:
                results.append(self.evaluate_condition(cond, data))
                
        if logical_op == 'OR':
            return any(results)
        return all(results)

    def evaluate_condition(self, cond: Dict[str, Any], data: Dict[str, Any]) -> bool:
        """Evaluates a single leaf condition."""
        path = cond.get('path')
        op_str = cond.get('op', '==')
        target_value = cond.get('value')
        
        if not path:
            return False
            
        actual_value = self._get_nested_value(data, path)
        
        # Handle exists/not_exists early as they don't depend on op_func logic
        if op_str == 'exists':
            return actual_value is not None
        if op_str == 'not_exists':
            return actual_value is None

        op_func = CIM_OPERATORS.get(op_str)
        if not op_func:
            return False
            
        try:
            # Smart numeric coercion: if either is a number, try to convert the other
            is_target_num = isinstance(target_value, (int, float))
            is_actual_num = isinstance(actual_value, (int, float))
            
            if is_target_num and not is_actual_num and actual_value is not None:
                try: actual_value = float(actual_value)
                except: pass
            elif is_actual_num and not is_target_num and target_value is not None:
                try: target_value = float(target_value)
                except: pass
                
            return op_func(actual_value, target_value)
        except Exception:
            return False

    def _get_nested_value(self, data: Dict[str, Any], path: str) -> Any:
        """Resolution of nested paths like 'terminal.connectivityNode.mrid'."""
        parts = path.split('.')
        current = data
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                # Handle indexed access if path includes it, e.g., 'terminals.0.mrid'
                try:
                    idx = int(part)
                    if 0 <= idx < len(current):
                        current = current[idx]
                    else:
                        return None
                except ValueError:
                    return None
            else:
                return None
        return current
