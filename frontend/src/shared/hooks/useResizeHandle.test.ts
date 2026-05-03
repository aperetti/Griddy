// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useResizeHandle } from './useResizeHandle';

// ── localStorage mock ───────────────────────────────────────
const storage: Record<string, string> = {};

beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => storage[String(key)] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
        storage[String(key)] = String(value);
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
        delete storage[String(key)];
    });
});

// ── Pointer event factory ───────────────────────────────────
function pointerEvent(
    type: string,
    overrides: Partial<PointerEventInit> = {},
): PointerEvent {
    return new PointerEvent(type, { bubbles: true, pointerId: 1, clientY: 0, ...overrides });
}

/** Create a PointerEvent bound to a real DOM element so currentTarget is set. */
function createResizeEvent(
    type: string,
    clientY: number,
): React.PointerEvent {
    const el = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
        tagName: 'DIV',
        nodeType: 1,
    } as unknown as HTMLElement;
    return {
        type,
        pointerId: 1,
        clientY,
        bubbles: true,
        currentTarget: el,
        target: el,
        stopPropagation: () => {},
        preventDefault: () => {},
        persist: () => {},
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
    } as unknown as React.PointerEvent;
}

// ── Tests ────────────────────────────────────────────────────
describe('useResizeHandle', () => {
    it('uses defaultHeight when localStorage is empty', () => {
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );
        expect(result.current.height).toBe(400);
    });

    it('restores saved height from localStorage', () => {
        storage['chart-panel-test'] = '550';
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );
        expect(result.current.height).toBe(550);
    });

    it('clamps saved height below minHeight', () => {
        storage['chart-panel-test'] = '50';
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400, minHeight: 200 }),
        );
        expect(result.current.height).toBe(200);
    });

    it('clamps saved height above maxHeight', () => {
        storage['chart-panel-test'] = '2000';
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400, maxHeight: 800 }),
        );
        expect(result.current.height).toBe(800);
    });

    it('falls back to defaultHeight on corrupt localStorage', () => {
        storage['chart-panel-test'] = '{invalid';
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );
        expect(result.current.height).toBe(400);
    });

    it('resizes on pointer drag within bounds', () => {
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400, minHeight: 200, maxHeight: 800 }),
        );

        // Start drag at y=400
        act(() => {
            result.current.resizeHandleProps.onPointerDown(createResizeEvent('pointerdown', 400));
        });

        // Drag down 100px → height = 500
        act(() => {
            result.current.resizeHandleProps.onPointerMove(createResizeEvent('pointermove', 500));
        });
        expect(result.current.height).toBe(500);

        // Drag up to y=200 (delta -200 from start) → clamped to minHeight 200
        act(() => {
            result.current.resizeHandleProps.onPointerMove(createResizeEvent('pointermove', 200));
        });
        expect(result.current.height).toBe(200);
    });

    it('persists height to localStorage on pointer up', () => {
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );

        act(() => {
            result.current.resizeHandleProps.onPointerDown(createResizeEvent('pointerdown', 400));
        });
        act(() => {
            result.current.resizeHandleProps.onPointerMove(createResizeEvent('pointermove', 550));
        });
        act(() => {
            result.current.resizeHandleProps.onPointerUp(createResizeEvent('pointerup', 550));
        });

        expect(JSON.parse(storage['chart-panel-test'])).toBe(550);
    });

    it('reverts to start height on pointer cancel', () => {
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );

        act(() => {
            result.current.resizeHandleProps.onPointerDown(createResizeEvent('pointerdown', 400));
        });
        act(() => {
            result.current.resizeHandleProps.onPointerMove(createResizeEvent('pointermove', 600));
        });
        expect(result.current.height).toBe(600);

        act(() => {
            result.current.resizeHandleProps.onPointerCancel(createResizeEvent('pointercancel', 600));
        });
        expect(result.current.height).toBe(400);
    });

    it('resetHeight restores default and persists it', () => {
        const { result } = renderHook(() =>
            useResizeHandle({ storageKey: 'test', defaultHeight: 400 }),
        );

        // Simulate resize to 500
        act(() => {
            result.current.resizeHandleProps.onPointerDown(createResizeEvent('pointerdown', 400));
        });
        act(() => {
            result.current.resizeHandleProps.onPointerMove(createResizeEvent('pointermove', 500));
        });
        act(() => {
            result.current.resizeHandleProps.onPointerUp(createResizeEvent('pointerup', 500));
        });
        expect(result.current.height).toBe(500);

        act(() => { result.current.resetHeight(); });
        expect(result.current.height).toBe(400);
        expect(JSON.parse(storage['chart-panel-test'])).toBe(400);
    });
});
