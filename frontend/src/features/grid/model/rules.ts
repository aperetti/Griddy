/**
 * Business logic and types for CIM Display Rules.
 * Following Clean Architecture: Pure functions and domain interfaces.
 */

/** @deprecated use TooltipAttribute */
export interface TooltipField {
    id: string;
    label: string;
    field: string;
}

/** A named attribute exposed as a {{alias}} token in the HTML template, or a label-value row in easy mode. */
export interface TooltipAttribute {
    id: string;
    alias: string;   // Token name used in template: "ratedS" → {{ratedS}}
    path: string;    // CIM property path, e.g. "IdentifiedObject.name", "container.name"
    label?: string;  // Human-readable label for easy mode display (e.g. "Rated Power (kVA)")
}

export interface TooltipConfig {
    /** 'easy' = auto-rendered label-value table; 'html' = custom HTML template. Defaults to 'html'. */
    tooltip_mode?: 'easy' | 'html';
    /** Attribute definitions — maps alias tokens to CIM property paths. */
    attributes: TooltipAttribute[];
    /** HTML template with {{alias}} tokens (html mode only). */
    html_template: string;
    /** @deprecated Legacy fields — kept for backward compat. */
    mode?: 'basic' | 'advanced';
    /** @deprecated Legacy fields — kept for backward compat. */
    fields?: TooltipField[];
}

export const DEFAULT_TOOLTIP_CONFIG: TooltipConfig = {
    tooltip_mode: 'easy',
    attributes: [],
    html_template: '',
};

export interface GraphPathStep {
    rel: string;    // Neo4j relationship type, e.g. "TransformerTank.PowerTransformer"
    label: string;  // CIM class at the end of this hop, e.g. "TransformerTank"
}

export interface Condition {
    id: string;
    path: string;
    step_id?: string;
    op: string;
    value: any;
    value_type?: 'literal' | 'property';
    compare_step_id?: string;
    compare_path?: string;
    /** Exact graph traversal path captured from the explorer. When present, the
     *  query builder uses these specific relationship hops instead of [*1..3]. */
    graph_path?: GraphPathStep[];
}

export interface ConditionGroup {
    id: string;
    logical_op: 'AND' | 'OR';
    conditions: (Condition | ConditionGroup)[];
}

export interface PathStep {
    id: string;
    parent_id?: string;
    /** CIM class name at this hop (e.g. "ConnectivityNode", "Terminal", "PowerElectronicsConnection") */
    class: string;
    /** When true this step is auto-populated and cannot be removed by the user */
    fixed?: boolean;
    /** CIM property paths from this class to project into tooltip data (e.g. "PowerTransformer.ratedS") */
    tooltip_attributes?: Array<{ attr: string; alias: string }>;
}

export interface MatchConditions extends ConditionGroup {
    target_class?: string;
    /** When true, the rule query traverses target_class → Terminal → ConnectivityNode
     *  and returns the ConnectivityNode mRID instead of the equipment mRID.
     *  Use for equipment that has a Terminal but is not directly in the topology
     *  (e.g. PowerElectronicsConnection, BatteryUnit). */
    resolve_via_connectivity_node?: boolean;
    /** 'guided' = path builder UI; 'custom_cypher' = raw Cypher textarea. Defaults to 'guided'. */
    rule_mode?: 'guided' | 'custom_cypher';
    /** 'node' = CN-centred symbol rule; 'edge' = topology edge styling rule. */
    entity_type?: 'node' | 'edge';
    /** Geometry filter: 'any' = all, 'node' = 1 point, 'edge' = >1 point */
    geometry_type?: 'any' | 'node' | 'edge';
    /** Ordered path steps for guided node rules */
    path_steps?: PathStep[];
    /** Raw Cypher for custom_cypher mode */
    custom_cypher?: string;
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
