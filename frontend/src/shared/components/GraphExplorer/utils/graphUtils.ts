// Internal n10s/RDF properties that are not useful for rule-building
export const SKIP_KEYS = new Set(['model_id', 'uri', 'rdf__type', '__type']);

/**
 * Strip CIM class prefix for display.
 * Example: "TransformerEndInfo.ratedS" → "ratedS"
 */
export function bareKey(key: string): string {
    if (!key) return key;
    const dot = key.lastIndexOf('.');
    return dot > -1 ? key.slice(dot + 1) : key;
}
