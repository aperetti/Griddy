/**
 * Business logic and types for CIM Display Rules.
 * Following Clean Architecture: Pure functions and domain interfaces.
 */

export interface TooltipField {
    id: string;
    label: string;   // Display label shown in tooltip
    field: string;   // Node/edge property path, e.g. "name", "base_voltage_kv"
}

export interface TooltipConfig {
    mode: 'basic' | 'advanced';
    fields: TooltipField[];
    html_template: string;
}

export const DEFAULT_TOOLTIP_CONFIG: TooltipConfig = {
    mode: 'basic',
    fields: [],
    html_template: '',
};

export interface GraphPathStep {
    rel: string;    // Neo4j relationship type, e.g. "TransformerTank.PowerTransformer"
    label: string;  // CIM class at the end of this hop, e.g. "TransformerTank"
}

export interface Condition {
    id: string;
    path: string;
    op: string;
    value: any;
    /** Exact graph traversal path captured from the explorer. When present, the
     *  query builder uses these specific relationship hops instead of [*1..3]. */
    graph_path?: GraphPathStep[];
}

export interface ConditionGroup {
    id: string;
    logical_op: 'AND' | 'OR';
    conditions: (Condition | ConditionGroup)[];
}

export interface MatchConditions extends ConditionGroup {
    target_class?: string;
}

/**
 * Generates a unique ID for rule conditions and groups.
 */
export const genId = () => Math.random().toString(36).substr(2, 9);

/**
 * Ensures every node in a condition tree has a unique ID and consistent structure.
 */
export const ensureIds = (node: any): any => {
    if (!node || typeof node !== 'object') return node;

    const isLeaf = 'path' in node;
    const newNode = { ...node, id: node.id || genId() };

    if (isLeaf) {
        // Strip accidental group properties from leaf conditions
        delete newNode.logical_op;
        delete newNode.conditions;
    } else {
        // Ensure group properties are present and consistent
        newNode.logical_op = newNode.logical_op || 'AND';
        newNode.conditions = Array.isArray(newNode.conditions) 
            ? newNode.conditions.map((c: any) => ensureIds(c)) 
            : [];
    }
    
    return newNode;
};

/**
 * Recursively updates a node in the condition tree.
 */
export const updateNode = (root: ConditionGroup, id: string, updater: (node: any) => any): ConditionGroup => {
    if (root.id === id) return updater(root);
    
    return {
        ...root,
        conditions: root.conditions.map(c => {
            if ('conditions' in c) return updateNode(c as ConditionGroup, id, updater);
            if (c.id === id) return updater(c);
            return c;
        })
    };
};

/**
 * Recursively removes a node from the condition tree.
 */
export const removeNode = (root: ConditionGroup, id: string): ConditionGroup => {
    return {
        ...root,
        conditions: root.conditions.filter(c => c.id !== id).map(c => {
            if ('conditions' in c) return removeNode(c as ConditionGroup, id);
            return c;
        })
    };
};

/**
 * List of common CIM operators supported by the Rule Builder.
 */
export const CIM_OPERATORS = [
    { value: '==', label: 'Equals' },
    { value: '!=', label: 'Not Equals' },
    { value: '>', label: 'Greater Than' },
    { value: '<', label: 'Less Than' },
    { value: '>=', label: 'Greater or Equal' },
    { value: '<=', label: 'Less or Equal' },
    { value: 'exists', label: 'Exists' },
    { value: 'not_exists', label: 'Does Not Exist' },
    { value: 'contains', label: 'Contains' },
    { value: 'length_gt', label: 'Length >' },
];
