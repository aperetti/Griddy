import React, { useState, useEffect } from 'react';
import { fetchCimSchema } from '../../../shared/api';

interface Condition {
    path: string;
    op: string;
    value: any;
}

interface MatchConditions {
    target_class?: string;
    conditions: Condition[];
}

interface CimRuleBuilderProps {
    value: string; // JSON string
    onChange: (value: string) => void;
}

export const CimRuleBuilder: React.FC<CimRuleBuilderProps> = ({ value, onChange }) => {
    const [schema, setSchema] = useState<Record<string, any>>({});
    const [config, setConfig] = useState<MatchConditions>(() => {
        try {
            const parsed = JSON.parse(value);
            return {
                target_class: parsed.target_class || '',
                conditions: parsed.conditions || []
            };
        } catch {
            return { conditions: [] };
        }
    });

    useEffect(() => {
        fetchCimSchema().then(setSchema).catch(console.error);
    }, []);

    const updateConfig = (newConfig: MatchConditions) => {
        setConfig(newConfig);
        onChange(JSON.stringify(newConfig));
    };

    const addCondition = () => {
        updateConfig({
            ...config,
            conditions: [...config.conditions, { path: '', op: '==', value: '' }]
        });
    };

    const removeCondition = (index: number) => {
        const newConditions = [...config.conditions];
        newConditions.splice(index, 1);
        updateConfig({ ...config, conditions: newConditions });
    };

    const updateCondition = (index: number, updates: Partial<Condition>) => {
        const newConditions = [...config.conditions];
        newConditions[index] = { ...newConditions[index], ...updates };
        updateConfig({ ...config, conditions: newConditions });
    };

    const availableClasses = Object.keys(schema).sort();
    const currentClassAttributes = config.target_class ? schema[config.target_class]?.attributes || [] : [];

    return (
        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
            <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
                    Target CIM Class
                </label>
                <select
                    value={config.target_class}
                    onChange={(e) => updateConfig({ ...config, target_class: e.target.value })}
                    style={{
                        width: '100%',
                        padding: '6px',
                        background: '#2a2a2a',
                        color: 'white',
                        border: '1px solid #444',
                        borderRadius: '4px'
                    }}
                >
                    <option value="">Any Class</option>
                    {availableClasses.map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                    ))}
                </select>
            </div>

            <div style={{ marginBottom: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '8px' }}>
                    Conditions (AND)
                </label>
                {config.conditions.map((cond, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                            <input
                                list={`attrs-${idx}`}
                                value={cond.path}
                                placeholder="attribute.path"
                                onChange={(e) => updateCondition(idx, { path: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '6px',
                                    background: '#2a2a2a',
                                    color: 'white',
                                    border: '1px solid #444',
                                    borderRadius: '4px'
                                }}
                            />
                            <datalist id={`attrs-${idx}`}>
                                {currentClassAttributes.map((attr: any) => (
                                    <option key={attr.name} value={attr.name} />
                                ))}
                            </datalist>
                        </div>
                        <select
                            value={cond.op}
                            onChange={(e) => updateCondition(idx, { op: e.target.value })}
                            style={{
                                width: '80px',
                                padding: '6px',
                                background: '#2a2a2a',
                                color: 'white',
                                border: '1px solid #444',
                                borderRadius: '4px'
                            }}
                        >
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value=">=">&gt;=</option>
                            <option value="<=">&lt;=</option>
                            <option value="contains">contains</option>
                        </select>
                        <input
                            value={cond.value}
                            placeholder="value"
                            onChange={(e) => updateCondition(idx, { value: e.target.value })}
                            style={{
                                width: '100px',
                                padding: '6px',
                                background: '#2a2a2a',
                                color: 'white',
                                border: '1px solid #444',
                                borderRadius: '4px'
                            }}
                        />
                        <button
                            onClick={() => removeCondition(idx)}
                            style={{
                                padding: '6px 10px',
                                background: '#442222',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            ×
                        </button>
                    </div>
                ))}
            </div>

            <button
                onClick={addCondition}
                style={{
                    padding: '6px 12px',
                    background: '#224422',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                }}
            >
                + Add Condition
            </button>

            <div style={{ marginTop: '15px', fontSize: '10px', color: '#666' }}>
                Tip: For nested relationships, use dots, e.g. <code>hierarchy.children.0.attributes.ratedS</code>
            </div>
        </div>
    );
};
