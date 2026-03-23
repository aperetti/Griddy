import { useState, useEffect, useRef } from 'react';

/** Shape of one entry in the backend sprite map JSON.
 *  Matches the dict returned by SpriteGenerator.generate(). */
export interface SpriteEntry {
    x: number;
    y: number;
    width: number;
    height: number;
    anchorX: number;
    anchorY: number;
    name?: string;
}

export interface SpriteMap {
    atlasUrl: string;
    mapping: Record<string, SpriteEntry>;
}

const SPRITE_PNG_URL = '/api/display-rules/sprites/map.png';
const SPRITE_JSON_URL = '/api/display-rules/sprites/map.json';

/**
 * Fetches the sprite atlas PNG URL and the icon mapping JSON from the backend.
 * Returns a SpriteMap that can be passed directly into deck.gl IconLayer's
 * `iconAtlas` and `iconMapping` props.
 *
 * The hook refetches automatically when `version` changes (increment it when
 * display rules are saved to force a refresh).
 */
export function useSpriteMap(version: number = 0): SpriteMap | null {
    const [spriteMap, setSpriteMap] = useState<SpriteMap | null>(null);
    const latestVersion = useRef(version);

    useEffect(() => {
        latestVersion.current = version;

        let cancelled = false;

        const load = async () => {
            try {
                const res = await fetch(SPRITE_JSON_URL);
                if (!res.ok) {
                    console.warn('[useSpriteMap] Failed to fetch sprite map JSON:', res.status);
                    return;
                }
                const mapping: Record<string, SpriteEntry> = await res.json();

                if (!cancelled) {
                    setSpriteMap({
                        // Cache-bust the PNG URL with version so deck.gl re-loads it
                        atlasUrl: `${SPRITE_PNG_URL}?v=${version}`,
                        mapping,
                    });
                }
            } catch (err) {
                console.warn('[useSpriteMap] Error loading sprite map:', err);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [version]);

    return spriteMap;
}
