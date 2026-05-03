/**
 * Lightweight per-feature performance instrumentation.
 *
 * No-op unless gated by `?perf=1` in the URL or `localStorage.perf === '1'`.
 * Uses the standard User Timing API so spans show up in Chrome DevTools'
 * Performance panel as well as the in-page table emitted by `dump()`.
 *
 * Server-Timing response headers are parsed via `recordServerTiming()` so
 * backend phase durations appear inline with frontend phases under the same
 * label namespace.
 */

type Span = { label: string; durationMs: number; source: 'fe' | 'be' };

let _enabled: boolean | null = null;
const _spans: Span[] = [];

function isEnabled(): boolean {
    if (_enabled !== null) return _enabled;
    if (typeof window === 'undefined') {
        _enabled = false;
        return false;
    }
    try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('perf') === '1') {
            _enabled = true;
            return true;
        }
        _enabled = window.localStorage?.getItem('perf') === '1';
    } catch {
        _enabled = false;
    }
    return _enabled!;
}

function nowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function record(label: string, durationMs: number, source: 'fe' | 'be' = 'fe'): void {
    if (!isEnabled()) return;
    _spans.push({ label, durationMs, source });
    try {
        if (typeof performance !== 'undefined' && source === 'fe') {
            // Best-effort: also write to the User Timing buffer for DevTools.
            performance.measure(label, { start: nowMs() - durationMs, duration: durationMs } as any);
        }
    } catch {
        // performance.measure with options form is not supported in older
        // browsers — silently ignore.
    }
}

/**
 * Time an async function. The result is returned unchanged; the duration is
 * recorded under `label`. Errors are still recorded (so failing fetches are
 * visible) before being re-thrown.
 */
export async function measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!isEnabled()) return fn();
    const t0 = nowMs();
    try {
        return await fn();
    } finally {
        record(label, nowMs() - t0);
    }
}

/** Time a synchronous function. */
export function measureSync<T>(label: string, fn: () => T): T {
    if (!isEnabled()) return fn();
    const t0 = nowMs();
    try {
        return fn();
    } finally {
        record(label, nowMs() - t0);
    }
}

/** Mark a single instant; useful for post-hoc duration calcs. */
export function mark(label: string, durationMs: number): void {
    record(label, durationMs);
}

/**
 * Parse a `Server-Timing` header value and record each entry as a backend
 * span. Phase names are prefixed with `be:` so frontend and backend rows are
 * distinguishable in the dumped table.
 *
 * Example header: `total;dur=512.3, query;dur=210.0, serialize;dur=80.5`
 */
export function recordServerTiming(headerValue: string | null | undefined): void {
    if (!isEnabled() || !headerValue) return;
    for (const part of headerValue.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // Each entry is `<name>;dur=<ms>` (description is optional and skipped).
        const segments = trimmed.split(';').map(s => s.trim());
        const name = segments[0];
        let dur = 0;
        for (const seg of segments.slice(1)) {
            const [k, v] = seg.split('=');
            if (k === 'dur' && v) {
                const parsed = parseFloat(v);
                if (!Number.isNaN(parsed)) dur = parsed;
            }
        }
        if (name) record(`be:${name}`, dur, 'be');
    }
}

/**
 * Print accumulated spans (since the last clear) and reset the buffer.
 * Returns the rows so callers can also persist them (e.g. Playwright tests).
 */
export function dump(scope?: string): Span[] {
    if (!isEnabled()) return [];
    const rows = _spans.slice();
    _spans.length = 0;
    if (rows.length === 0) return rows;
    const label = scope ? `[perf:${scope}]` : '[perf]';
    try {
        // eslint-disable-next-line no-console
        console.groupCollapsed(`${label} ${rows.length} spans`);
        // eslint-disable-next-line no-console
        console.table(rows.map(r => ({ phase: r.label, ms: r.durationMs.toFixed(2), src: r.source })));
        // eslint-disable-next-line no-console
        console.groupEnd();
    } catch {
        // ignore
    }
    return rows;
}

/** For tests/Playwright: read enabled state and the current buffer. */
export function _internal_isEnabled(): boolean { return isEnabled(); }
export function _internal_buffer(): Span[] { return _spans.slice(); }
