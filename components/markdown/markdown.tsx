// components/markdown/markdown.tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import ReactMarkdown, {Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {motion, AnimatePresence} from 'framer-motion';
import {
    ExternalLink,
    LinkIcon as LinkAnchorIcon,
    Image as ImageIcon,
    ChevronDown,
    ArrowUpWideNarrow,
    X,
    Copy,
} from 'lucide-react';
import {cn} from '@/lib/utils';

import {EnhancedTable} from './enhanced-table';
import {remarkAutolinkClinical} from './remark-autolink-clinical';

/* ---------- Shared helpers ---------- */

function getNodeText(node: any): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join('');
    if (React.isValidElement(node)) return getNodeText((node as any).props?.children);
    return '';
}

function slugify(text: string) {
    return text.toLowerCase().trim().replace(/[\s\W-]+/g, '-').replace(/^-+|-+$/g, '');
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
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(getText());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1100);
                } catch {
                    // no-op
                }
            }}
            className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs bg-background/80 hover:bg-accent transition',
                className,
            )}
        >
            <Copy className="h-3.5 w-3.5"/>
            {label ?? (copied ? 'Copied' : 'Copy')}
        </button>
    );
}

/* ---------- Headings with anchor copy ---------- */

function heading(tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6', base: string) {
    return function Heading({
                                children,
                                ...props
                            }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) {
        const text = getNodeText(children);
        const id = slugify(text);
        const [copied, setCopied] = React.useState(false);
        const Comp = tag as any;

        return (
            <Comp id={id} {...props} className={cn(base, 'group scroll-mt-28 anchor-target', props.className)}>
                <button
                    type="button"
                    onClick={async () => {
                        try {
                            const url = `${window.location.origin}${window.location.pathname}#${id}`;
                            await navigator.clipboard.writeText(url);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1000);
                        } catch {
                        }
                    }}
                    aria-label="Copy link"
                    className={cn(
                        'not-prose mr-1 -ml-6 inline-flex h-5 w-5 items-center justify-center rounded-sm',
                        'opacity-0 transition group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-primary/30',
                    )}
                >
                    <motion.div
                        initial={false}
                        animate={{scale: copied ? 1.1 : 1}}
                        transition={{type: 'spring', stiffness: 500, damping: 30}}
                        className="text-muted-foreground"
                    >
                        <LinkAnchorIcon className="h-4 w-4"/>
                    </motion.div>
                </button>
                {children}
                <AnimatePresence>
                    {copied && (
                        <motion.span
                            initial={{opacity: 0, y: -6}}
                            animate={{opacity: 1, y: 0}}
                            exit={{opacity: 0, y: -6}}
                            className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                        >
                            Link copied
                        </motion.span>
                    )}
                </AnimatePresence>
            </Comp>
        );
    };
}

/* ---------- Code blocks ---------- */

function CodeBlock({
                       inline,
                       className,
                       children,
                       ...props
                   }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1];
    const code = getNodeText(children);
    if (inline) {
        return (
            <code className={cn('rounded-md bg-muted px-1.5 py-0.5 text-[0.9em]', className)} {...props}>
                {children}
            </code>
        );
    }

    return (
        <div className="relative my-3 overflow-hidden rounded-xl border bg-background">
            <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-md bg-muted px-1.5 py-0.5 uppercase tracking-wide">{lang ?? 'text'}</span>
                <CopyButton getText={() => code}/>
            </div>
            <pre className="overflow-x-auto p-3 text-sm leading-relaxed">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
        </div>
    );
}

/* ---------- Image with Lightbox ---------- */

function MDImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    const {alt, ...rest} = props;
    const [open, setOpen] = React.useState(false);

    return (
        <>
            <figure className="my-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    {...rest}
                    alt={alt ?? ''}
                    className={cn(
                        'mx-auto rounded-xl border object-contain',
                        'transition-transform duration-300 hover:scale-[1.02] cursor-zoom-in',
                        props.className,
                    )}
                    onClick={() => setOpen(true)}
                />
                {alt ? <figcaption className="mt-2 text-center text-xs text-muted-foreground">{alt}</figcaption> : null}
            </figure>

            <AnimatePresence>
                {open && (
                    <motion.div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
                        initial={{opacity: 0}}
                        animate={{opacity: 1}}
                        exit={{opacity: 0}}
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            className="relative"
                            initial={{scale: 0.98, y: 8}}
                            animate={{scale: 1, y: 0}}
                            exit={{scale: 0.98, y: 8}}
                            transition={{type: 'spring', stiffness: 260, damping: 24}}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img {...rest} alt={alt ?? ''}
                                 className="max-h-[90vh] max-w-[92vw] rounded-xl border object-contain"/>
                            <button
                                type="button"
                                aria-label="Close"
                                className="absolute -right-3 -top-3 rounded-full border bg-background p-1 shadow"
                                onClick={() => setOpen(false)}
                            >
                                <X className="h-4 w-4"/>
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

/* ---------- Lists, Links, Blockquotes ---------- */

const components: Partial<Components> = {
    table: (props) => <EnhancedTable {...props} />,
    thead: ({children, ...props}) => (
        <thead {...props} className={cn('bg-background', (props as any).className)}>
        {children}
        </thead>
    ),
    tbody: ({children, ...props}) => (
        <tbody {...props} className={(props as any).className}>
        {children}
        </tbody>
    ),

    ol: ({children, ...props}) => (
        <ol className="list-decimal list-outside ml-5 space-y-1 marker:text-primary/80" {...props}>
            {children}
        </ol>
    ),
    ul: ({children, ...props}) => (
        <ul className="list-disc list-outside ml-5 space-y-1 marker:text-primary/80" {...props}>
            {children}
        </ul>
    ),
    li: ({children, ...props}) => (
        <motion.li initial={{opacity: 0, y: 2}} animate={{opacity: 1, y: 0}} transition={{duration: 0.12}}
                   className="py-0.5 leading-relaxed" {...props}>
            {children}
        </motion.li>
    ),

    strong: ({children, ...props}) => (
        <span className="font-semibold" {...props}>
      {children}
    </span>
    ),

    a: ({children, href, ...props}) => {
        const external = href?.startsWith('http');
        // @ts-expect-error
        return (
            <Link
                className="inline-flex items-center gap-1 text-inherit underline underline-offset-4 hover:opacity-90 focus:outline-none focus:ring-2 rounded-sm"
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                href={href ?? '#'}
                {...props}
            >
            {children}
                {external && <ExternalLink className="h-3.5 w-3.5"/>}
            </Link>
        );
    },

    blockquote: ({children, ...props}) => (
        <blockquote
            className="my-4 rounded-r-lg border-l-2 bg-muted/30 pl-4 pr-3 py-2 italic text-muted-foreground" {...props}>
            {children}
        </blockquote>
    ),

    h1: heading('h1', 'text-3xl font-semibold mt-8 mb-3 tracking-tight'),
    h2: heading('h2', 'text-2xl font-semibold mt-7 mb-2.5 tracking-tight'),
    h3: heading('h3', 'text-xl font-semibold mt-6 mb-2 tracking-tight'),
    h4: heading('h4', 'text-lg font-semibold mt-5 mb-2'),
    h5: heading('h5', 'text-base font-semibold mt-4 mb-2'),
    h6: heading('h6', 'text-sm font-semibold mt-3 mb-2'),

    img: (props) => <MDImage {...(props as any)} />,

    code: (props: any) => <CodeBlock {...props} />,
    pre: ({children}) => <>{children}</>,
};

const remarkPlugins = [remarkGfm, remarkAutolinkClinical];

/* ---------- Top Contents (TOC) Card ---------- */

function useHeadings(containerRef: React.RefObject<HTMLDivElement>) {
    const [heads, setHeads] = React.useState<{ id: string; text: string; level: number }[]>([]);
    const [activeId, setActiveId] = React.useState<string | null>(null);

    React.useEffect(() => {
        const root = containerRef.current;
        if (!root) return;
        const nodes = Array.from(root.querySelectorAll<HTMLElement>('.anchor-target'));
        const list = nodes.map((el) => {
            const tag = el.tagName.toLowerCase();
            const level = Number(tag.replace('h', '')) || 6;
            return {id: el.id, text: el.textContent || '', level};
        });
        setHeads(list);

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => (a.target as HTMLElement).offsetTop - (b.target as HTMLElement).offsetTop);
                if (visible[0]) {
                    setActiveId((visible[0].target as HTMLElement).id);
                }
            },
            {rootMargin: '0px 0px -70% 0px', threshold: [0, 1]},
        );

        nodes.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [containerRef]);

    return {heads, activeId};
}

function TopContents({
                         headings,
                         activeId,
                     }: {
    headings: { id: string; text: string; level: number }[];
    activeId: string | null;
}) {
    const [open, setOpen] = React.useState(true);
    if (headings.length < 3) return null;

    return (
        <div className="mb-6">
            <div className="rounded-xl border bg-background/70 p-3 backdrop-blur">
                <button
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-accent"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                >
                    <div
                        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5"/>
                        Contents
                    </div>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-0' : '-rotate-90')}/>
                </button>

                <AnimatePresence initial={false}>
                    {open && (
                        <motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}}
                                    exit={{height: 0, opacity: 0}} className="overflow-hidden">
                            <nav className="mt-2">
                                <ul className="flex flex-wrap gap-1.5">
                                    {headings.map((h) => (
                                        <li key={h.id}>
                                            <a
                                                href={`#${h.id}`}
                                                className={cn(
                                                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs hover:bg-accent',
                                                    activeId === h.id ? 'text-primary bg-primary/10 border-primary/30' : 'text-foreground',
                                                )}
                                            >
                                                {h.text}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </nav>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ---------- Back-to-top button ---------- */

function BackToTop({target}: { target: React.RefObject<HTMLDivElement> }) {
    const [show, setShow] = React.useState(false);
    React.useEffect(() => {
        function onScroll() {
            setShow(window.scrollY > 600);
        }

        window.addEventListener('scroll', onScroll, {passive: true});
        onScroll();
        return () => window.removeEventListener('scroll', onScroll);
    }, []);
    return (
        <AnimatePresence>
            {show && (
                <motion.button
                    type="button"
                    aria-label="Back to top"
                    initial={{opacity: 0, y: 8, scale: 0.96}}
                    animate={{opacity: 1, y: 0, scale: 1}}
                    exit={{opacity: 0, y: 8, scale: 0.96}}
                    onClick={() => {
                        const root = target.current;
                        if (root) root.scrollIntoView({behavior: 'smooth', block: 'start'});
                        window.scrollTo({top: 0, behavior: 'smooth'});
                    }}
                    className="fixed bottom-6 right-6 z-40 rounded-full border bg-background/90 p-2 shadow-lg backdrop-blur hover:bg-accent"
                >
                    <ArrowUpWideNarrow className="h-5 w-5"/>
                </motion.button>
            )}
        </AnimatePresence>
    );
}

/* ---------- Markdown Root ---------- */

const NonMemoizedMarkdown = ({children, className}: { children: string; className?: string }) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const {heads, activeId} = useHeadings(containerRef);

    // Removed per-stream console logging to keep the UI snappy.
    // Frequent logging of the entire markdown string can delay paint and feel like "non-streaming".

    return (
        <div className="relative">
            {/* TOP CONTENTS (does not squeeze width) */}
            <TopContents headings={heads} activeId={activeId}/>

            <div
                ref={containerRef}
                className={cn(
                    'prose-headings:text-inherit prose-p:text-inherit prose-li:text-inherit prose-strong:text-inherit prose-code:text-inherit prose-a:text-inherit',
                    className,
                )}
            >
                <ReactMarkdown remarkPlugins={remarkPlugins as any} components={components}>
                    {children}
                </ReactMarkdown>
            </div>

            <BackToTop target={containerRef}/>
        </div>
    );
};

export const Markdown = React.memo(NonMemoizedMarkdown, (prev, next) => prev.children === next.children);