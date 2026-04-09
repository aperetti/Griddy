/**
 * Client-side Cypher query builder for CIM display rules.
 *
 * Uses @neo4j/cypher-builder to generate parameterized, injection-safe Cypher.
 *
 * Key API note: In @neo4j/cypher-builder, node labels must be declared on the
 * Pattern options (e.g. `new Cypher.Pattern(n, { labels: ['Foo'] })`), NOT on
 * the node/variable constructor. Passing labels to NamedNode/Node constructors
 * is silently ignored by the library.
 *
 * Traversal strategy:
 *   - If the class prefix of `path` is the target class or a known CIM base class
 *     (properties stored directly on the node by n10s) → direct match on `n`
 *   - Otherwise → EXISTS subquery with variable-length undirected traversal to
 *     the related node:  EXISTS { (n:Target)-[*1..3]-(e:CimClass) WHERE e.`prop` = $val }
 */

import * as Cypher from '@neo4j/cypher-builder';
import type { MatchConditions, Condition, ConditionGroup, GraphPathStep, PathStep } from './rules';

// CIM base/mixin classes whose properties are stored directly on equipment nodes
const INHERITED_CLASSES = new Set([
    'IdentifiedObject',
    'PowerSystemResource',
    'Equipment',
    'ConductingEquipment',
    'Switch',
    'Conductor',
    'EnergyConnection',
    'ConnectivityNodeContainer',
    'EquipmentContainer',
]);

export interface BuiltQuery {
    cypher: string;
    params: Record<string, unknown>;
}

export interface BuildRuleQueryOptions {
    /** Scope the query to only these mRIDs — eliminates full-graph scans when the
     *  active topology is known. Neo4j can use the mRID index on the IN list before
     *  evaluating any expensive EXISTS traversals. */
    activeMrids?: string[];
}

/**
 * Builds a parameterized Cypher MATCH query returning `mrid` values for nodes
 * matching the given rule conditions. Returns null if no target class is set.
 *
 * When `options.activeMrids` is provided, the query is scoped to that set so
 * Neo4j skips equipment that isn't in the active topology — critical for
 * EXISTS subqueries which are expensive at full-graph scale.
 */
export function buildRuleQuery(
    conditions: MatchConditions,
    options?: BuildRuleQueryOptions,
): BuiltQuery | null {
    const targetClass = conditions.target_class;
    if (!targetClass) return null;

    // When resolve_via_connectivity_node is set, traverse from the target equipment
    // node to its parent ConnectivityNode via Terminal.  This handles equipment types
    // (e.g. PowerElectronicsConnection) that are not loaded into the in-memory topology
    // but whose grid position can be found by walking Terminal → ConnectivityNode.
    //
    // Conditions are applied to the equipment node (n), not the ConnectivityNode.
    // activeMrids are ConnectivityNode mRIDs (from topology), so we do NOT scope
    // equipment by activeMrids — only the resulting ConnectivityNode is scoped.
    if (conditions.resolve_via_connectivity_node) {
        const equipQuery = buildRuleQuery(
            { ...conditions, resolve_via_connectivity_node: false },
            undefined, // no mRID scoping on equipment — activeMrids are CN mRIDs
        );
        if (!equipQuery) return null;

        // Strip the RETURN clause from the equipment query, then append CN traversal
        const returnIdx = equipQuery.cypher.lastIndexOf('RETURN');
        const equipPortion = equipQuery.cypher.slice(0, returnIdx).trimEnd();

        const activeMrids = options?.activeMrids;
        const cnScopeLine = activeMrids?.length
            ? `\nWHERE cn.\`IdentifiedObject.mRID\` IN $activeMrids`
            : '';
        const cnParams = activeMrids?.length ? { activeMrids } : {};

        return {
            cypher: `${equipPortion}\nMATCH (n)-[]-(t:Terminal)-[]-(cn:ConnectivityNode)${cnScopeLine}\nRETURN DISTINCT cn.\`IdentifiedObject.mRID\` AS mrid`,
            params: { ...equipQuery.params, ...cnParams },
        };
    }

    // NamedNode('n') creates the variable reference — labels go on the Pattern, not here.
    const n = new Cypher.NamedNode('n');
    const matchPattern = new Cypher.Pattern(n, { labels: [targetClass] });

    const whereExpr = buildWhereExpr(conditions, n, targetClass);

    const mridProp = n.property('IdentifiedObject.mRID');
    const matchClause = new Cypher.Match(matchPattern);
    if (whereExpr) {
        matchClause.where(whereExpr);
    }
    matchClause.return([mridProp, 'mrid']);

    const { cypher, params } = matchClause.build();

    // Scope to active topology mrids — inject before RETURN so Neo4j can use the
    // mRID index to prune the candidate set before evaluating EXISTS subqueries.
    if (options?.activeMrids && options.activeMrids.length > 0) {
        const mridKey = 'activeMrids';
        const mridFilter = `n.\`IdentifiedObject.mRID\` IN $${mridKey}`;
        const returnIdx = cypher.lastIndexOf('RETURN');
        if (returnIdx > -1) {
            const before = cypher.slice(0, returnIdx);
            const after = cypher.slice(returnIdx);
            const hasWhere = /WHERE/i.test(before);
            const sep = hasWhere ? ' AND ' : ' WHERE ';
            return {
                cypher: before.trimEnd() + sep + mridFilter + '\n' + after,
                params: { ...params, [mridKey]: options.activeMrids },
            };
        }
    }

    return { cypher, params };
}

/**
 * Entry point for the new rule builder modes.
 *
 * - custom_cypher: passes the raw Cypher through as-is
 * - path_steps present: builds a CN-anchored traversal query
 * - fallback: delegates to buildRuleQuery (legacy target_class mode)
 */
export function buildPathQuery(
    conditions: MatchConditions,
    options?: BuildRuleQueryOptions,
): BuiltQuery | null {
    // Custom Cypher pass-through
    if (conditions.rule_mode === 'custom_cypher') {
        const cypher = (conditions.custom_cypher || '').trim();
        if (!cypher) return null;
        return { cypher, params: {} };
    }

    // Path-based guided node rule
    const steps = conditions.path_steps;
    if (steps && steps.length > 0) {
        return _buildFromPathSteps(conditions, steps, options);
    }

    // Legacy fallback
    return buildRuleQuery(conditions, options);
}

function _buildFromPathSteps(
    conditions: MatchConditions,
    steps: PathStep[],
    options?: BuildRuleQueryOptions,
): BuiltQuery | null {
    if (steps.length < 1) return null;

    // Assign aliases: ConnectivityNode → cn, Terminal → t, rest → n (first user step), n1, n2…
    const aliases: string[] = [];
    let userIdx = 0;
    for (const step of steps) {
        if (step.fixed) {
            aliases.push(step.class === 'ConnectivityNode' ? 'cn' : 't');
        } else {
            aliases.push(userIdx === 0 ? 'n' : `n${userIdx}`);
            userIdx++;
        }
    }

    // MATCH pattern: (cn:ConnectivityNode)-[]-(t:Terminal)-[]-(n:TargetClass)
    const patternParts = [`(${aliases[0]}:${steps[0].class})`];
    for (let i = 1; i < steps.length; i++) {
        patternParts.push(`-[]-(${aliases[i]}:${steps[i].class})`);
    }
    const matchClause = `MATCH ${patternParts.join('')}`;

    // Target = last non-fixed step
    const targetClass = steps[steps.length - 1].class;
    const targetAlias = aliases[aliases.length - 1];

    // Reuse the WHERE building logic from the legacy path by building a sub-query on
    // the target node, then extracting the WHERE fragment from the result.
    // We synthesise a fake MatchConditions targeting the last step's class.
    const legacyConditions: MatchConditions = {
        ...conditions,
        target_class: targetClass,
        resolve_via_connectivity_node: false,
        rule_mode: 'guided',
        path_steps: undefined,
    };
    const legacyResult = buildRuleQuery(legacyConditions, undefined);
    if (!legacyResult) return null;

    // Replace "MATCH (n:TargetClass)" and "RETURN n.mRID" with our path pattern
    let cypher = legacyResult.cypher;

    // Strip the legacy MATCH clause and rewrite the RETURN
    const whereIdx = cypher.search(/WHERE/i);
    const returnIdx = cypher.lastIndexOf('RETURN');

    let wherePart = '';
    if (whereIdx > -1 && whereIdx < returnIdx) {
        wherePart = cypher.slice(whereIdx, returnIdx).trimEnd();
        // Replace 'n.' references with the target alias if different
        if (targetAlias !== 'n') {
            wherePart = wherePart.replace(/\bn\./g, `${targetAlias}.`);
            wherePart = wherePart.replace(/\(n:/g, `(${targetAlias}:`);
        }
    }

    const returnPart = `RETURN DISTINCT cn.\`IdentifiedObject.mRID\` AS mrid`;

    const parts = [matchClause];
    if (wherePart) parts.push(wherePart);
    parts.push(returnPart);
    cypher = parts.join('\n');

    return { cypher, params: legacyResult.params };
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function buildWhereExpr(
    group: ConditionGroup,
    n: Cypher.NamedNode,
    targetClass: string,
): Cypher.Predicate | undefined {
    if (!group.conditions.length) return undefined;

    const fragments: Cypher.Predicate[] = [];

    for (const cond of group.conditions) {
        const expr = 'logical_op' in cond
            ? buildWhereExpr(cond as ConditionGroup, n, targetClass)
            : buildLeafExpr(cond as Condition, n, targetClass);
        if (expr) fragments.push(expr);
    }

    if (fragments.length === 0) return undefined;
    if (fragments.length === 1) return fragments[0];

    return group.logical_op === 'OR'
        ? Cypher.or(...(fragments as [Cypher.Predicate, Cypher.Predicate, ...Cypher.Predicate[]]))
        : Cypher.and(...(fragments as [Cypher.Predicate, Cypher.Predicate, ...Cypher.Predicate[]]));
}

function buildLeafExpr(
    cond: Condition,
    n: Cypher.NamedNode,
    targetClass: string,
): Cypher.Predicate | undefined {
    const { path, op, value } = cond;
    if (!path || !op) return undefined;

    const dotIdx = path.indexOf('.');
    const classPrefix = dotIdx > -1 ? path.slice(0, dotIdx) : null;

    const isDirect =
        !classPrefix ||
        classPrefix === targetClass ||
        INHERITED_CLASSES.has(classPrefix);

    if (isDirect) {
        return buildComparison(n.property(path), op, coerceValue(value));
    }

    return buildExistsSubquery(n, targetClass, path, classPrefix!, op, value, cond.graph_path);
}

function buildComparison(
    prop: Cypher.Property,
    op: string,
    value: unknown,
): Cypher.Predicate | undefined {
    const param = new Cypher.Param(value);

    switch (op) {
        case '==': case 'eq': {
            const numericCmp = Cypher.eq(prop, param);
            // n10s stores all RDF literals as strings — add OR with string form for numeric values
            if (typeof value === 'number') {
                const strParam = new Cypher.Param(String(value));
                return Cypher.or(numericCmp, Cypher.eq(prop, strParam));
            }
            return numericCmp;
        }
        case '!=': case 'neq':  return Cypher.neq(prop, param);
        // n10s stores numeric CIM properties as strings, so wrap in toFloat() for
        // ordered comparisons — toFloat("1500000") < 1500000 works correctly.
        case '>':  case 'gt':   return Cypher.gt(Cypher.toFloat(prop), param);
        case '<':  case 'lt':   return Cypher.lt(Cypher.toFloat(prop), param);
        case '>=': case 'gte':  return Cypher.gte(Cypher.toFloat(prop), param);
        case '<=': case 'lte':  return Cypher.lte(Cypher.toFloat(prop), param);
        case 'contains':        return Cypher.contains(prop, param);
        case 'starts_with':     return Cypher.startsWith(prop, param);
        case 'ends_with':       return Cypher.endsWith(prop, param);
        case 'exists':          return Cypher.isNotNull(prop);
        case 'not_exists':      return Cypher.isNull(prop);
        default:                return undefined;
    }
}

/**
 * Generates an EXISTS subquery traversing from the root node to the related node.
 * Uses `EXISTS { MATCH pattern WHERE condition }` — the WHERE is on the MATCH clause,
 * not inlined into the node pattern, so it works across all Neo4j versions.
 *
 * When `graphPath` is provided (captured from the graph explorer), uses the exact
 * relationship types and intermediate node labels the user navigated:
 *   EXISTS { MATCH (n:Target)-[:`rel1`]-(:Node1)-[:`rel2`]-(e:CimClass) WHERE e.`prop` = $val }
 *
 * Falls back to variable-length undirected traversal when no path is captured:
 *   EXISTS { MATCH (n:Target)-[*1..3]-(e:CimClass) WHERE e.`prop` = $val }
 */
function buildExistsSubquery(
    n: Cypher.NamedNode,
    targetClass: string,
    path: string,
    className: string,
    op: string,
    value: unknown,
    graphPath?: GraphPathStep[],
): Cypher.Predicate {
    const e = new Cypher.Node();
    let traversalPattern: Cypher.Pattern;

    if (graphPath && graphPath.length > 0) {
        // Hop-by-hop pattern using the captured graph traversal path.
        // Hops with empty rel (undiscovered relationship type) use any-relationship [].
        let partial: any = new Cypher.Pattern(n, { labels: [targetClass] })
            .related(undefined, graphPath[0].rel
                ? { type: graphPath[0].rel, direction: 'undirected' }
                : { direction: 'undirected' });

        for (let i = 0; i < graphPath.length - 1; i++) {
            const hop = graphPath[i];
            const nextHop = graphPath[i + 1];
            const mid = new Cypher.Node();
            partial = partial
                .to(mid, hop.label ? { labels: [hop.label] } : {})
                .related(undefined, nextHop.rel
                    ? { type: nextHop.rel, direction: 'undirected' }
                    : { direction: 'undirected' });
        }

        traversalPattern = partial.to(e, { labels: [className] }) as Cypher.Pattern;
    } else {
        traversalPattern = new Cypher.Pattern(n, { labels: [targetClass] })
            .related(undefined, { length: { min: 1, max: 3 }, direction: 'undirected' })
            .to(e, { labels: [className] }) as unknown as Cypher.Pattern;
    }

    // Put WHERE on the MATCH clause (not inline on the node) for broad Neo4j version compat
    const innerMatch = new Cypher.Match(traversalPattern as any);
    const comparison = buildComparison(e.property(path), op, coerceValue(value));
    if (comparison) {
        innerMatch.where(comparison);
    }

    return new Cypher.Exists(innerMatch);
}

/** Coerce string-encoded numbers to their numeric type for correct param binding. */
function coerceValue(val: unknown): unknown {
    if (typeof val !== 'string' || val === '') return val;
    if (/^-?\d+$/.test(val)) return parseInt(val, 10);
    if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
    return val;
}
