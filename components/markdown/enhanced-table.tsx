// components/markdown/enhanced-table.tsx
'use client';

import * as React from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {
    Copy,
    Download,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    X,
    Search,
    Info,
    Square,
    CheckSquare,
    Minus,
    Plus,
} from 'lucide-react';
import {cn} from '@/lib/utils';
import {toast} from '../toast';


/* ---------- Utilities ---------- */

function getNodeText(node: any): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join('');
    if (React.isValidElement(node)) return getNodeText((node as any).props?.children);
    return '';
}

function toCsv(headers: string[], rows: string[][]) {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

function toCsvWithBom(headers: string[], rows: string[][]) {
    // Helps Excel/open-office detect UTF-8 reliably
    return '\uFEFF' + toCsv(headers, rows);
}

function detectType(values: string[]) {
    const first = values.find((v) => v?.trim().length);
    if (!first) return 'string';
    if (/^-?\d+(\.\d+)?$/.test(first)) return 'number';
    const d = Date.parse(first);
    if (!Number.isNaN(d)) return 'date';
    return 'string';
}

/* ---------- Media & copy helpers ---------- */

function useMediaQuery(query: string) {
    const [matches, setMatches] = React.useState(false);
    React.useEffect(() => {
        const m = window.matchMedia(query);
        const onChange = () => setMatches(m.matches);
        onChange();
        m.addEventListener('change', onChange);
        return () => m.removeEventListener('change', onChange);
    }, [query]);
    return matches;
}

function CopyButton({
                        getText,
                        className,
                        children: label,
                    }: {
    getText: () => string;
    className?: string;
    children?: React.ReactNode;
}) {
    const [copied, setCopied] = React.useState(false);
    return (
        <button
            type="button"
            aria-label="Copy"
            aria-live="polite"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(getText());
                    toast({type: 'success', description: 'Copied to clipboard.'});
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1100);
                } catch {
                    // no-op
                }
            }}
            className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                className,
            )}
            title="Copy to clipboard"
        >
            <Copy className="h-3.5 w-3.5"/>
            {label ?? (copied ? 'Copied' : 'Copy')}
        </button>
    );
}

/* ---------- Robust markdown table parsing helpers ---------- */

function isTag(el: any, tag: 'thead' | 'tbody' | 'tr' | 'th' | 'td') {
    if (!el || typeof el !== 'object') return false;
    const t = (el as any).type;
    if (t === tag) return true; // intrinsic element
    const p = (el as any).props || {};
    if (p?.node?.tagName === tag) return true; // react-markdown passes HAST node
    if (p?.originalType === tag) return true; // some wrappers expose originalType
    return false;
}

function firstChildOfType(children: React.ReactNode, tag: 'thead' | 'tbody') {
    const arr = React.Children.toArray(children) as any[];
    return arr.find((el) => isTag(el, tag));
}

function extractHeaders(theadEl: any, tbodyEl: any): string[] | undefined {
    if (theadEl) {
        const tr = (React.Children.toArray(theadEl.props?.children) as any[]).find((c) => isTag(c, 'tr'));
        if (tr) {
            const ths = (React.Children.toArray(tr.props?.children) as any[]).filter((c) => isTag(c, 'th'));
            const labels = ths.map((th) => getNodeText(th.props?.children));
            if (labels.length) return labels;
        }
    }
    // Fallback: use first row from tbody as headers if no thead present
    if (tbodyEl) {
        const firstTr = (React.Children.toArray(tbodyEl.props?.children) as any[]).find((c) => isTag(c, 'tr'));
        if (firstTr) {
            const tds = (React.Children.toArray(firstTr.props?.children) as any[]).filter((c) => isTag(c, 'td') || isTag(c, 'th'));
            const labels = tds.map((td, i) => {
                const text = getNodeText(td.props?.children).trim();
                return text || `Column ${i + 1}`;
            });
            if (labels.length) return labels;
        }
    }
    return undefined;
}

function extractBodyRows(tbodyEl: any): string[][] | undefined {
    if (!tbodyEl) return undefined;
    const trs = (React.Children.toArray(tbodyEl.props?.children) as any[]).filter((c) => isTag(c, 'tr'));
    if (!trs.length) return [];
    return trs.map((tr) => {
        const cells = (React.Children.toArray(tr.props?.children) as any[]).filter((c) => isTag(c, 'td') || isTag(c, 'th'));
        return cells.map((cell) => getNodeText(cell.props?.children));
    });
}

/* ---------- Helpers ---------- */

function highlightMatch(text: string, query: string) {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length);
    return (
        <>
            {before}
            <mark className="rounded-sm bg-primary/15 text-primary">{match}</mark>
            {after}
        </>
    );
}

function usePersistentState<T>(key: string, initial: T) {
    const [state, setState] = React.useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : initial;
        } catch {
            return initial;
        }
    });
    React.useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch {
            // no-op
        }
    }, [key, state]);
    return [state, setState] as const;
}

/* ---------- Component ---------- */

export function EnhancedTable({children}: { children: React.ReactNode }) {
    // Parse table from markdown output
    const theadEl = firstChildOfType(children, 'thead') as any;
    const tbodyEl = firstChildOfType(children, 'tbody') as any;

    const headers = extractHeaders(theadEl, tbodyEl);
    const rawRows = extractBodyRows(tbodyEl);

    // If parsing fails, render plain table
    if (!rawRows || rawRows.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[EnhancedTable] Falling back to plain table: unable to parse <thead>/<tbody> structure.');
        }
        return <table className="w-full border rounded-lg">{children}</table>;
    }

    const effectiveHeaders = React.useMemo(() => {
        if (headers && headers.length) return headers;
        const n = rawRows[0]?.length ?? 0;
        return Array.from({length: n}, (_, i) => `Column ${i + 1}`);
    }, [headers, rawRows]);

    // (3) Hide columns where every trimmed value is identical across all rows.
    // Keep at least the first column to avoid empty tables for single-row data.
    const visibleColumnIdxs = React.useMemo(() => {
        const colCount = effectiveHeaders.length;
        if (colCount === 0) return [] as number[];

        const idxs: number[] = [];
        for (let i = 0; i < colCount; i++) {
            const set = new Set<string>();
            for (const r of rawRows) {
                const v = (r[i] ?? '').trim();
                set.add(v);
                if (set.size > 1) break;
            }
            if (set.size > 1) idxs.push(i);
        }

        if (idxs.length === 0) {
            // Edge case: all columns uniform (e.g., single-row table). Keep the first column.
            return [0];
        }
        return idxs;
    }, [effectiveHeaders, rawRows]);

    const vHeaders = React.useMemo(() => visibleColumnIdxs.map((i) => effectiveHeaders[i]), [visibleColumnIdxs, effectiveHeaders]);

    // Preferences & state keyed to visible headers signature
    const prefKey = React.useMemo(() => {
        const sig = vHeaders.join('|');
        return `md-table:${sig}`;
    }, [vHeaders]);

    const [query, setQuery] = usePersistentState<string>(`${prefKey}:q`, '');
    const [density, setDensity] = usePersistentState<'cozy' | 'compact'>(`${prefKey}:density`, 'cozy');
    const [pageSize] = usePersistentState<number>(`${prefKey}:ps`, 25); // fixed page size (no UI)
    const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());

    // Column widths + resizing for visible columns
    const [colWidths, setColWidths] = usePersistentState<(number | null)[]>(
        `${prefKey}:widths`,
        vHeaders.map(() => null),
    );
    const headerRefs = React.useRef<(HTMLTableCellElement | null)[]>([]);
    const resizing = React.useRef<{ idx: number; startX: number; startW: number } | null>(null);

    React.useEffect(() => {
        function onMove(e: MouseEvent) {
            if (!resizing.current) return;
            const dx = e.clientX - resizing.current.startX;
            const newW = Math.max(96, Math.min(320, resizing.current.startW + dx));
            setColWidths((prev) => prev.map((w, i) => (i === resizing.current!.idx ? newW : w)));
        }

        function onUp() {
            resizing.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, [setColWidths]);

    // Measure widths initially
    React.useEffect(() => {
        const need = colWidths.some((w) => w == null);
        if (!need) return;
        const measured = vHeaders.map((_, i) => headerRefs.current[i]?.getBoundingClientRect().width ?? 160);
        setColWidths(measured);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vHeaders]);

    // Keyboard: '/' focuses filter
    React.useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (
                e.key === '/' &&
                (document.activeElement === document.body ||
                    (document.activeElement as HTMLElement)?.tagName === 'A')
            ) {
                e.preventDefault();
                const input = document.getElementById('md-table-filter') as HTMLInputElement | null;
                input?.focus();
                input?.select();
            }
        }

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Filtering (search applies to row text across ALL columns, not just visible ones)
    const filtered = React.useMemo(() => {
        if (!query.trim()) return rawRows;
        const q = query.toLowerCase();
        return rawRows.filter((r: string[]) => r.some((c) => c?.toLowerCase().includes(q)));
    }, [rawRows, query]);

    // Project to visible columns
    const rows = React.useMemo(
        () => filtered.map((r) => visibleColumnIdxs.map((i) => r[i] ?? '')),
        [filtered, visibleColumnIdxs],
    );

    // Aggregates for visible numeric columns
    const aggregates = React.useMemo(() => {
        if (!rows.length) return null;
        const numericCols = vHeaders
            .map((_, i) => ({i, type: detectType(rows.map((r) => r[i]))}))
            .filter((c) => c.type === 'number')
            .map((c) => c.i);
        const sum: Record<number, number> = {};
        for (const i of numericCols) sum[i] = 0;
        for (const r of rows) {
            for (const i of numericCols) {
                const v = Number(r[i]);
                if (!Number.isNaN(v)) sum[i] += v;
            }
        }
        return {numericCols, sum, count: rows.length};
    }, [rows, vHeaders]);

    // Selection
    const keyForRow = (row: string[]) => row.join('||'); // good enough without sorting
    const isSelected = (row: string[]) => selectedKeys.has(keyForRow(row));
    const toggleRow = (row: string[]) => {
        const key = keyForRow(row);
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };
    const clearSelection = () => setSelectedKeys(new Set());
    const anySelected = selectedKeys.size > 0;

    const toggleAllOnPage = (pageRows: string[][]) => {
        const keys = pageRows.map(keyForRow);
        const allSelected = keys.every((k) => selectedKeys.has(k));
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (allSelected) {
                keys.forEach((k) => next.delete(k));
            } else {
                keys.forEach((k) => next.add(k));
            }
            return next;
        });
    };

    // Pagination (kept)
    const [pageInternal, setPageInternal] = React.useState(1);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(pageInternal, totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const pageRows = rows.slice(start, end);

    React.useEffect(() => {
        setPageInternal(1);
    }, [query]);

    const isMobile = useMediaQuery('(max-width: 768px)');

    const csvCurrentView = React.useMemo(() => toCsvWithBom(vHeaders, rows), [vHeaders, rows]);
    const csvSelected = React.useMemo(
        () => toCsvWithBom(vHeaders, rows.filter((r) => isSelected(r))),
        [vHeaders, rows, selectedKeys],
    );

    /* ---------- Mobile card rendering ---------- */
    if (isMobile) {
        return (
            <div
                className="group relative my-4 rounded-xl border bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                {/* Controls */}
                <div className="flex flex-col gap-2 p-2.5 border-b">
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                            aria-hidden
                        />
                        <input
                            id="md-table-filter"
                            type="search"
                            placeholder=" Type here to filter rows…  "
                            value={query}
                            onChange={(e) => setQuery(e.currentTarget.value)}
                            className="w-full rounded-md border pl-10 pr-10 py-1.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Filter rows"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded hover:bg-muted p-1 text-muted-foreground"
                                aria-label="Clear filter"
                                title="Clear"
                            >
                                <X className="h-3.5 w-3.5"/>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => setDensity((d) => (d === 'cozy' ? 'compact' : 'cozy'))}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Toggle density"
                        >
                            {density === 'cozy' ? (
                                <>
                                    <Minus className="h-3.5 w-3.5"/> Compact
                                </>
                            ) : (
                                <>
                                    <Plus className="h-3.5 w-3.5"/> Cozy
                                </>
                            )}
                        </button>

                        <div className="flex items-center gap-2">
                            <CopyButton getText={() => csvCurrentView}>Copy CSV</CopyButton>
                            <button
                                type="button"
                                onClick={() => {
                                    const blob = new Blob([csvCurrentView], {type: 'text/csv;charset=utf-8;'});
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = 'table.csv';
                                    a.click();
                                    URL.revokeObjectURL(url);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Download CSV"
                                title="Download CSV"
                            >
                                <Download className="h-3.5 w-3.5"/> CSV
                            </button>
                        </div>
                    </div>
                </div>

                <div className={cn('grid gap-2 p-2', density === 'compact' ? 'grid-cols-1' : 'grid-cols-1')}>
                    {pageRows.length === 0 ? (
                        <div className="px-2 py-6 text-center text-muted-foreground">No matching records.</div>
                    ) : (
                        pageRows.map((row, idx) => {
                            const selected = isSelected(row);
                            return (
                                <div
                                    key={`${start + idx}-${row.join('|')}`}
                                    className={cn(
                                        'rounded-lg border bg-background p-3 shadow-xs transition',
                                        'hover:bg-muted/50', // (4) professional hover
                                        selected && 'bg-primary/15', // (2) clear selected state
                                    )}
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="text-sm font-medium">{row[0] || '—'}</div>
                                        <button
                                            type="button"
                                            onClick={() => toggleRow(row)}
                                            className={cn(
                                                'text-xs inline-flex items-center gap-1 rounded-md border px-2 py-1 transition',
                                                selected
                                                    ? 'bg-muted/30 text-foreground border-transparent hover:bg-muted/40 shadow-none'
                                                    : 'bg-background hover:bg-muted',
                                            )}
                                            aria-pressed={selected}
                                            aria-label={selected ? 'Deselect row' : 'Select row'}
                                            title={selected ? 'Deselect' : 'Select'}
                                        >
                                            {selected ? <CheckSquare className="h-3.5 w-3.5"/> :
                                                <Square className="h-3.5 w-3.5"/>}
                                            {selected ? 'Selected' : 'Select'}
                                        </button>
                                    </div>
                                    <dl className="grid grid-cols-2 gap-2 text-xs">
                                        {row.map((cell, cIdx) => {
                                            const label = vHeaders[cIdx];
                                            if (!label) return null;
                                            return (
                                                <div key={cIdx} className="rounded-md border bg-muted/40 p-2">
                                                    <dt className="text-muted-foreground">{label}</dt>
                                                    <dd className="mt-0.5 font-medium">
                                                        {query ? highlightMatch(cell || '—', query) : cell || '—'}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer meta & pagination */}
                <div className="flex flex-col gap-2 border-t p-2">
                    <div className="text-xs text-muted-foreground">
                        Showing <span className="font-medium">{total === 0 ? 0 : start + 1}</span>–
                        <span className="font-medium">{end}</span> of <span className="font-medium">{total}</span>
                        {query && (
                            <>
                                {' '}
                                (filtered from <span className="font-medium">{rawRows.length}</span>)
                            </>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                            <button
                                className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setPageInternal(1)}
                                disabled={currentPage === 1}
                                aria-label="First page"
                                title="First page"
                            >
                                <ChevronsLeft className="h-3.5 w-3.5"/>
                            </button>
                            <button
                                className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setPageInternal((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                aria-label="Previous page"
                                title="Previous page"
                            >
                                <ChevronLeft className="h-3.5 w-3.5"/>
                            </button>
                            <span className="px-2 text-xs text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
                            <button
                                className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setPageInternal((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                aria-label="Next page"
                                title="Next page"
                            >
                                <ChevronRight className="h-3.5 w-3.5"/>
                            </button>
                            <button
                                className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => setPageInternal(totalPages)}
                                disabled={currentPage === totalPages}
                                aria-label="Last page"
                                title="Last page"
                            >
                                <ChevronsRight className="h-3.5 w-3.5"/>
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            {anySelected && (
                                <>
                                    <CopyButton getText={() => csvSelected} className="text-xs">
                                        Copy selected
                                    </CopyButton>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const blob = new Blob([csvSelected], {type: 'text/csv;charset=utf-8;'});
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = 'selected.csv';
                                            a.click();
                                            URL.revokeObjectURL(url);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        title="Download selected rows"
                                    >
                                        <Download className="h-3.5 w-3.5"/> Selected
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearSelection}
                                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        title="Clear selection"
                                    >
                                        <X className="h-3.5 w-3.5"/> Clear
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    /* ---------- Desktop table ---------- */
    return (
        <div
            className="group relative my-4 rounded-xl border bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 p-2.5 border-b">
                <div className="relative flex-1 min-w-[260px]">
                    <Search
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden
                    />
                    <input
                        id="md-table-filter"
                        type="search"
                        placeholder="   Type here to filter rows…  "
                        onChange={(e) => setQuery(e.currentTarget.value)}
                        value={query}
                        className="w-full rounded-md border pl-10 pr-10 py-1.5 text-sm bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Filter table rows"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded hover:bg-muted p-1 text-muted-foreground"
                            aria-label="Clear filter"
                            title="Clear"
                        >
                            <X className="h-3.5 w-3.5"/>
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Density */}
                    <button
                        type="button"
                        onClick={() => setDensity((d) => (d === 'cozy' ? 'compact' : 'cozy'))}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Toggle density"
                        title="Toggle density"
                    >
                        {density === 'cozy' ? (
                            <>
                                <Minus className="h-3.5 w-3.5"/> Compact
                            </>
                        ) : (
                            <>
                                <Plus className="h-3.5 w-3.5"/> Cozy
                            </>
                        )}
                    </button>

                    {/* Copy / Download */}
                    <CopyButton getText={() => toCsvWithBom(vHeaders, rows)}>Copy CSV</CopyButton>
                    <button
                        type="button"
                        onClick={() => {
                            const blob = new Blob([toCsvWithBom(vHeaders, rows)], {type: 'text/csv;charset=utf-8;'});
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'table.csv';
                            a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Download CSV"
                        title="Download CSV"
                    >
                        <Download className="h-3.5 w-3.5"/>
                        CSV
                    </button>
                </div>
            </div>

            {/* Scroll container with edge gradients */}
            <div className="relative overflow-x-auto">
                {/* Aggregates */}
                {aggregates && aggregates.numericCols.length > 0 && (
                    <div
                        className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-muted-foreground border-b bg-background/70">
                        <Info className="h-3.5 w-3.5"/>
                        <span className="font-medium">Quick totals:</span>
                        {aggregates.numericCols.map((i) => (
                            <span key={i} className="rounded-md border bg-muted/40 px-2 py-0.5">
                {vHeaders[i]} = <span className="font-medium">{aggregates!.sum[i].toLocaleString()}</span>
              </span>
                        ))}
                        <span className="ml-auto">Rows: {aggregates.count.toLocaleString()}</span>
                    </div>
                )}

                {/* Table */}
                <table className="w-full max-w-full table-auto text-sm">
                    <thead className="sticky top-0 z-10 bg-background/90 backdrop-blur">
                    <tr className="border-b">
                        {/* Selection header cell with page toggle */}
                        <th className="px-2 py-2 w-10 text-left">
                            <button
                                className="rounded border p-1 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => toggleAllOnPage(pageRows)}
                                aria-label="Toggle select all on this page"
                                title="Select/Deselect page"
                            >
                                {pageRows.length > 0 &&
                                pageRows.every((r) => isSelected(r)) ? (
                                    <CheckSquare className="h-3.5 w-3.5"/>
                                ) : pageRows.some((r) => isSelected(r)) ? (
                                    <Minus className="h-3.5 w-3.5"/>
                                ) : (
                                    <Square className="h-3.5 w-3.5"/>
                                )}
                            </button>
                            <span className="sr-only">Select</span>
                        </th>
                        {vHeaders.map((h, idx) => {
                            const width = colWidths[idx];
                            return (
                                <th
                                    key={idx}
                                    ref={(el) => (headerRefs.current[idx] = el)}
                                    className={cn(
                                        'relative text-left font-semibold px-3 py-2 align-middle select-none border-l first:border-l-0',                                    )}
                                    style={width ? {width, minWidth: width, maxWidth: width} : undefined}
                                    scope="col"
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span>{h}</span>
                                        {/* Resizer */}
                                        <div
                                            role="separator"
                                            aria-orientation="vertical"
                                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
                                            onMouseDown={(e) => {
                                                const th = (e.currentTarget as HTMLDivElement).parentElement as HTMLTableCellElement;
                                                const startW = th.getBoundingClientRect().width;
                                                resizing.current = {idx, startX: e.clientX, startW};
                                                document.body.style.cursor = 'col-resize';
                                                document.body.style.userSelect = 'none';
                                            }}
                                            title="Drag to resize column"
                                        />
                                    </div>
                                </th>
                            );
                        })}
                    </tr>
                    </thead>

                    {/* Flat body (no grouping) */}
                    <tbody>
                        <AnimatePresence initial={false}>
                            {pageRows.length === 0 ? (
                                <tr>
                                    <td colSpan={vHeaders.length + 1}
                                        className="px-3 py-6 text-center text-muted-foreground">
                                        No matching rows.
                                    </td>
                                </tr>
                            ) : (
                                pageRows.map((row, rIdx) => {
                                    const selected = isSelected(row);
                                    return (
                                        <tr
                                            key={`${start + rIdx}-${row.join('|')}`}
                                            variants={{hidden: {opacity: 0}, visible: {opacity: 1}}}
                                            exit={{opacity: 0}}
                                            aria-selected={selected}
                                            className={cn(
                                                'border-b last:border-b-0 transition',
                                                rIdx % 2 === 0 ? 'bg-transparent' : 'bg-muted/40',
                                                'hover:bg-accent/10', // (4) professional hover state
                                                selected && 'bg-primary/15', // (2) selected clarity
                                            )}
                                        >
                                            {/* Selection cell */}
                                            <td className={cn('px-2', density === 'compact' ? 'py-1.5' : 'py-2.5')}>
                                                <button
                                                    className={cn(
                                                        'rounded border p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                                        selected ? 'bg-primary text-primary-foreground border-primary hover:opacity-90' : 'hover:bg-muted',
                                                    )}
                                                    aria-label={selected ? 'Deselect row' : 'Select row'}
                                                    aria-pressed={selected}
                                                    onClick={() => toggleRow(row)}
                                                    title={selected ? 'Deselect' : 'Select'}
                                                >
                                                    {selected ? <CheckSquare className="h-3.5 w-3.5"/> :
                                                        <Square className="h-3.5 w-3.5"/>}
                                                </button>
                                            </td>
                                            {row.map((cell, cIdx) => {
                                                const width = colWidths[cIdx] ?? undefined;
                                                return (
                                                    <td
                                                        key={cIdx}
                                                        className={cn('px-3 align-top', density === 'compact' ? 'py-1.5' : 'py-2.5')}
                                                        style={width ? {
                                                            width,
                                                            minWidth: width,
                                                            maxWidth: width
                                                        } : undefined}
                                                    >
                                                        <div className="min-w-0 whitespace-pre-wrap break-words">
                                                            {query ? (
                                                                highlightMatch(cell || '—', query)
                                                            ) : cell ? (
                                                                cell
                                                            ) : (
                                                                <span className="text-muted-foreground">—</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })
                            )}
                        </AnimatePresence>
                    </tbody>
                </table>
            </div>

            {/* Footer meta & pagination */}
            <div className="flex flex-col gap-2 border-t p-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-muted-foreground">
                    Showing <span className="font-medium">{total === 0 ? 0 : start + 1}</span>–
                    <span className="font-medium">{Math.min(end, total)}</span> of <span
                    className="font-medium">{total}</span>
                    {anySelected && (
                        <>
                            {' '}
                            • <span className="font-medium">{selectedKeys.size}</span> selected
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPageInternal(1)}
                            disabled={currentPage === 1}
                            aria-label="First page"
                            title="First page"
                        >
                            <ChevronsLeft className="h-3.5 w-3.5"/>
                        </button>
                        <button
                            className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPageInternal((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            aria-label="Previous page"
                            title="Previous page"
                        >
                            <ChevronLeft className="h-3.5 w-3.5"/>
                        </button>
                        <span className="px-2 text-xs text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
                        <button
                            className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPageInternal((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            aria-label="Next page"
                            title="Next page"
                        >
                            <ChevronRight className="h-3.5 w-3.5"/>
                        </button>
                        <button
                            className="rounded-md border p-1 text-xs hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setPageInternal(totalPages)}
                            disabled={currentPage === totalPages}
                            aria-label="Last page"
                            title="Last page"
                        >
                            <ChevronsRight className="h-3.5 w-3.5"/>
                        </button>
                    </div>

                    {/* Selection actions */}
                    <div className="ml-auto flex items-center gap-2">
                        {anySelected && (
                            <>
                                <CopyButton getText={() => csvSelected} className="text-xs">
                                    Copy selected
                                </CopyButton>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const blob = new Blob([csvSelected], {type: 'text/csv;charset=utf-8;'});
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'selected.csv';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    title="Download selected rows"
                                >
                                    <Download className="h-3.5 w-3.5"/> Selected
                                </button>
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    title="Clear selection"
                                >
                                    <X className="h-3.5 w-3.5"/> Clear
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}