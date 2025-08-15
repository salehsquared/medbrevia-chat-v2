// components/markdown/remark-autolink-clinical.ts
/**
 * Tiny remark plugin to autolink DOIs/PMIDs even if the model outputs bare text (non-markdown).
 * We avoid extra deps and mutate parent.children arrays directly, skipping code/links.
 */
type MNode = any;

export function remarkAutolinkClinical() {
    const DOI_RE = /\b(?:doi:\s*)?(10\.\d{4,9}\/[^\s)]+)\b/gi;
    const PMID_RE = /\b(?:pmid[:\s]*)(\d{4,9})\b/gi;

    function splitToNodes(value: string): MNode[] {
        const out: MNode[] = [];
        let i = 0;
        while (i < value.length) {
            DOI_RE.lastIndex = i;
            PMID_RE.lastIndex = i;
            const doiMatch = DOI_RE.exec(value);
            const pmidMatch = PMID_RE.exec(value);

            let next:
                | { kind: 'doi' | 'pmid'; m: RegExpExecArray }
                | undefined;
            if (doiMatch && pmidMatch) {
                next =
                    doiMatch.index <= pmidMatch.index
                        ? { kind: 'doi', m: doiMatch }
                        : { kind: 'pmid', m: pmidMatch };
            } else if (doiMatch) {
                next = { kind: 'doi', m: doiMatch };
            } else if (pmidMatch) {
                next = { kind: 'pmid', m: pmidMatch };
            }

            if (!next) {
                out.push({ type: 'text', value: value.slice(i) });
                break;
            }

            // leading text
            if (next.m.index! > i) {
                out.push({ type: 'text', value: value.slice(i, next.m.index!) });
            }

            if (next.kind === 'doi') {
                const doi = next.m[1];
                out.push({
                    type: 'link',
                    url: `https://doi.org/${doi}`,
                    children: [{ type: 'text', value: `doi:${doi}` }],
                });
            } else {
                const pmid = next.m[1];
                out.push({
                    type: 'link',
                    url: `https://medbrevia.com/article/${pmid}`,
                    children: [{ type: 'text', value: `PMID:${pmid}` }],
                });
            }
            i = next.m.index! + next.m[0].length;
        }
        return out;
    }

    return (tree: MNode) => {
        const SKIP = new Set(['code', 'inlineCode', 'link', 'linkReference']);
        function visit(node: MNode) {
            if (!node || !Array.isArray(node.children)) return;
            if (SKIP.has(node.type)) return;

            let changed = false;
            const nextChildren: MNode[] = [];

            for (const child of node.children) {
                if (child && child.type === 'text' && typeof child.value === 'string') {
                    const v: string = child.value;
                    if (/\b(10\.\d{4,9}\/[^\s)]+)|pmid[:\s]*\d{4,9}\b/i.test(v)) {
                        const nodes = splitToNodes(v);
                        nextChildren.push(...nodes);
                        changed = true;
                    } else {
                        nextChildren.push(child);
                    }
                } else {
                    visit(child);
                    nextChildren.push(child);
                }
            }

            if (changed) node.children = nextChildren;
        }
        visit(tree);
    };
}