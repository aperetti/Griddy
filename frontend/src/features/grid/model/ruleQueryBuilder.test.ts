import { describe, it, expect } from 'vitest';
import { buildRuleQuery } from './ruleQueryBuilder';
import type { MatchConditions } from './rules';

function makeConditions(overrides: Partial<MatchConditions> = {}): MatchConditions {
    return {
        id: 'root',
        logical_op: 'AND',
        conditions: [],
        ...overrides,
    };
}

describe('buildRuleQuery', () => {
    describe('normal queries', () => {
        it('returns null when no target_class is set', () => {
            expect(buildRuleQuery(makeConditions())).toBeNull();
        });

        it('generates a simple MATCH with no conditions', () => {
            const result = buildRuleQuery(makeConditions({ target_class: 'PowerTransformer' }));
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/MATCH \(n:PowerTransformer\)/);
            expect(result!.cypher).toMatch(/RETURN/i);
        });

        it('applies a direct property equals condition', () => {
            const result = buildRuleQuery(makeConditions({
                target_class: 'PowerTransformer',
                conditions: [{ id: 'c1', path: 'PowerTransformer.ratedS', op: '==', value: 1000000 }],
            }));
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/WHERE/i);
            expect(result!.cypher).toMatch(/ratedS/);
        });

        it('applies an EXISTS subquery for cross-class property', () => {
            const result = buildRuleQuery(makeConditions({
                target_class: 'PowerTransformer',
                conditions: [{ id: 'c1', path: 'TransformerTank.ratedKVA', op: '>', value: 500 }],
            }));
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/EXISTS/);
            expect(result!.cypher).toMatch(/TransformerTank/);
        });

        it('scopes to activeMrids when provided', () => {
            const mrids = ['mrid-1', 'mrid-2'];
            const result = buildRuleQuery(
                makeConditions({ target_class: 'PowerTransformer' }),
                { activeMrids: mrids },
            );
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/IdentifiedObject\.mRID.*IN \$activeMrids/);
            expect(result!.params.activeMrids).toEqual(mrids);
        });
    });

    describe('resolve_via_connectivity_node', () => {
        it('generates CN traversal query with no conditions', () => {
            const result = buildRuleQuery(makeConditions({
                target_class: 'PowerElectronicsConnection',
                resolve_via_connectivity_node: true,
            }));
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/MATCH \(n:PowerElectronicsConnection\)/);
            expect(result!.cypher).toMatch(/MATCH \(n\)-\[]-\(t:Terminal\)-\[]-\(cn:ConnectivityNode\)/);
            expect(result!.cypher).toMatch(/RETURN DISTINCT cn\.`IdentifiedObject\.mRID` AS mrid/);
        });

        it('applies equipment conditions before the CN traversal', () => {
            const result = buildRuleQuery(makeConditions({
                target_class: 'PowerElectronicsConnection',
                resolve_via_connectivity_node: true,
                conditions: [{
                    id: 'c1',
                    path: 'PowerElectronicsConnection.ratedS',
                    op: '>',
                    value: 100000,
                }],
            }));
            expect(result).not.toBeNull();
            // Equipment WHERE appears before the CN MATCH
            const whereIdx = result!.cypher.search(/WHERE/i);
            const cnMatchIdx = result!.cypher.indexOf('MATCH (n)-[');
            expect(whereIdx).toBeGreaterThan(-1);
            expect(whereIdx).toBeLessThan(cnMatchIdx);
            // CN traversal and return present
            expect(result!.cypher).toMatch(/MATCH \(n\)-\[]-\(t:Terminal\)-\[]-\(cn:ConnectivityNode\)/);
            expect(result!.cypher).toMatch(/RETURN DISTINCT cn\.`IdentifiedObject\.mRID` AS mrid/);
        });

        it('applies multiple AND conditions on equipment', () => {
            const result = buildRuleQuery(makeConditions({
                target_class: 'BatteryUnit',
                resolve_via_connectivity_node: true,
                logical_op: 'AND',
                conditions: [
                    { id: 'c1', path: 'BatteryUnit.ratedE', op: '>', value: 1000 },
                    { id: 'c2', path: 'IdentifiedObject.name', op: 'contains', value: 'Solar' },
                ],
            }));
            expect(result).not.toBeNull();
            expect(result!.cypher).toMatch(/WHERE/i);
            expect(result!.cypher).toMatch(/MATCH \(n\)-\[]-\(t:Terminal\)-\[]-\(cn:ConnectivityNode\)/);
            expect(result!.cypher).toMatch(/RETURN DISTINCT cn\.`IdentifiedObject\.mRID` AS mrid/);
        });

        it('scopes ConnectivityNode to activeMrids, not equipment', () => {
            const mrids = ['cn-mrid-1', 'cn-mrid-2'];
            const result = buildRuleQuery(
                makeConditions({
                    target_class: 'PowerElectronicsConnection',
                    resolve_via_connectivity_node: true,
                    conditions: [{
                        id: 'c1',
                        path: 'PowerElectronicsConnection.ratedS',
                        op: '>',
                        value: 50000,
                    }],
                }),
                { activeMrids: mrids },
            );
            expect(result).not.toBeNull();
            // CN scope appears after the CN MATCH
            const cnMatchIdx = result!.cypher.indexOf('MATCH (n)-[');
            const cnScopeIdx = result!.cypher.indexOf('cn.`IdentifiedObject.mRID` IN $activeMrids');
            expect(cnScopeIdx).toBeGreaterThan(cnMatchIdx);
            // Equipment portion (before CN MATCH) is NOT scoped to activeMrids
            const equipPortion = result!.cypher.slice(0, cnMatchIdx);
            expect(equipPortion).not.toMatch(/IdentifiedObject\.mRID.*IN \$activeMrids/);
            expect(result!.params.activeMrids).toEqual(mrids);
        });

        it('returns null when target_class is missing', () => {
            const result = buildRuleQuery(makeConditions({ resolve_via_connectivity_node: true }));
            expect(result).toBeNull();
        });
    });
});
