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
        if (typeof value !== 'string') return value || { conditions: [] };
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

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        fetchCimSchema().then(setSchema).catch(console.error);
        
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
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
                    <div 
                        key={idx} 
                        style={{ 
                            display: 'flex', 
                            flexDirection: isMobile ? 'column' : 'row',
                            gap: '8px', 
                            marginBottom: '12px', 
                            alignItems: isMobile ? 'stretch' : 'flex-start',
                            flexWrap: 'wrap',
                            padding: '8px',
                            background: 'rgba(0,0,0,0.1)',
                            borderRadius: '4px'
                        }}
                    >
                        <div style={{ 
                            flex: isMobile ? '1 1 100%' : '1 1 200px', 
                            minWidth: isMobile ? '100%' : '150px' 
                        }}>
                            <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '2px' }}>Path</label>
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
                                    borderRadius: '4px',
                                    fontSize: '13px'
                                }}
                            />
                            <datalist id={`attrs-${idx}`}>
                                {(() => {
                                    const pathParts = cond.path.split('.');
                                    const prefix = pathParts.slice(0, -1).join('.');
                                    
                                    let options: string[] = [];
                                    
                                    if (cond.path.startsWith('hierarchy')) {
                                        const hierarchyKeys = ['mrid', 'name', 'class', 'attributes', 'children'];
                                        if (cond.path === 'hierarchy' || cond.path === 'hierarchy.') {
                                            options = hierarchyKeys.map(k => `hierarchy.${k}`);
                                        } else if (cond.path.includes('attributes.')) {
                                            options = currentClassAttributes.map((a: any) => `${prefix}.${a.name}`);
                                        } else if (cond.path.includes('children.')) {
                                            const parts = cond.path.split('.');
                                            if (parts.length === 3) {
                                                options = hierarchyKeys.map(k => `${prefix}.${k}`);
                                            }
                                        }
                                    } else {
                                        options = currentClassAttributes.map((attr: any) => attr.name);
                                        options.push('hierarchy');
                                    }
                                    
                                    return options.map(opt => (
                                        <option key={opt} value={opt} />
                                    ));
                                })()}
                            </datalist>
                        </div>

                        <div style={{ 
                            display: 'flex', 
                            gap: '8px', 
                            flex: isMobile ? '1 1 100%' : '1 1 auto',
                            alignItems: 'flex-end'
                        }}>
                            <div style={{ flex: '1 1 100px', minWidth: '80px' }}>
                                <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '2px' }}>Op</label>
                                <select
                                    value={cond.op}
                                    onChange={(e) => updateCondition(idx, { op: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '6px',
                                        background: '#2a2a2a',
                                        color: 'white',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        fontSize: '13px'
                                    }}
                                >
                                    <option value="==">==</option>
                                    <option value="!=">!=</option>
                                    <option value=">">&gt;</option>
                                    <option value="<">&lt;</option>
                                    <option value=">=">&gt;=</option>
                                    <option value="<=">&lt;=</option>
                                    <option value="contains">contains</option>
                                    <option value="exists">exists</option>
                                    <option value="not_exists">not exists</option>
                                </select>
                            </div>
                            {(cond.op !== 'exists' && cond.op !== 'not_exists') && (
                                <div style={{ flex: '2 1 120px', minWidth: '100px' }}>
                                    <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '2px' }}>Value</label>
                                    <input
                                        value={cond.value}
                                        placeholder="value"
                                        onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '6px',
                                            background: '#2a2a2a',
                                            color: 'white',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            fontSize: '13px'
                                        }}
                                    />
                                </div>
                            )}
                            <div style={{ flex: '0 0 32px' }}>
                                <button
                                    onClick={() => removeCondition(idx)}
                                    title="Remove condition"
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        padding: 0,
                                        background: '#442222',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '18px'
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
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
