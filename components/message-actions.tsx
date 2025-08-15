// components/message-actions.tsx
'use client';

import {useCallback, useEffect, useMemo, useRef, useState, memo} from 'react';
import {useSWRConfig} from 'swr';
import {useCopyToClipboard} from 'usehooks-ts';
import equal from 'fast-deep-equal';
import {motion, AnimatePresence, useReducedMotion} from 'framer-motion';
import {toast} from 'sonner';

import type {Vote} from '@/lib/db/schema';
import type {ChatMessage} from '@/lib/types';

import {Button} from './ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from './ui/tooltip';

// ✅ Lucide icons
import {ClipboardCopy, Check, ThumbsUp, ThumbsDown, Loader2} from 'lucide-react';

/* --------------------------------------------------------------------------------
 * Micro-interaction helpers
 * -------------------------------------------------------------------------------- */

const hoverScale = 1.06;
const tapScale = 0.96;

const spring = {type: 'spring', stiffness: 500, damping: 30, mass: 0.6};

const fadeVariants = {
    hidden: {opacity: 0, y: 2},
    show: {opacity: 1, y: 0, transition: {...spring, delay: 0.05}},
    exit: {opacity: 0, y: -2, transition: {...spring, duration: 0.12}},
};

function classNames(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

/* --------------------------------------------------------------------------------
 * Action Button (animated, accessible, production-ready)
 * -------------------------------------------------------------------------------- */

type ActionButtonProps = {
    children: React.ReactNode;
    tooltip: string;
    disabled?: boolean;
    'data-testid'?: string;
    onClick?: () => void | Promise<void>;
    isActive?: boolean;
    isPending?: boolean;
    ariaLabel?: string;
    tone?: 'neutral' | 'success' | 'danger' | 'brand';
};

function ActionButton({
                          children,
                          tooltip,
                          disabled,
                          onClick,
                          isActive,
                          isPending,
                          'data-testid': dataTestId,
                          ariaLabel,
                          tone = 'neutral',
                      }: ActionButtonProps) {
    const prefersReducedMotion = useReducedMotion();

    // Color system tuned for light/dark, subtle yet communicative
    const toneClass = useMemo(() => {
        if (tone === 'success') {
            return isActive
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/30'
                : 'text-emerald-700/80 dark:text-emerald-300/80';
        }
        if (tone === 'danger') {
            return isActive
                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-400/30'
                : 'text-rose-700/80 dark:text-rose-300/80';
        }
        if (tone === 'brand') {
            return isActive
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'text-primary/90';
        }
        return 'text-muted-foreground';
    }, [tone, isActive]);

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <motion.div
                    whileHover={!disabled && !prefersReducedMotion ? {scale: hoverScale} : {}}
                    whileTap={!disabled && !prefersReducedMotion ? {scale: tapScale} : {}}
                    transition={spring}
                    className="inline-flex"
                >
                    <Button
                        type="button"
                        aria-label={ariaLabel ?? tooltip}
                        data-testid={dataTestId}
                        onClick={onClick}
                        disabled={disabled}
                        variant="outline"
                        className={classNames(
                            'relative h-fit py-1 px-2 rounded-md border',
                            // Better focus-ring for a11y
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/60',
                            // Active + tone
                            toneClass,
                            isActive ? 'shadow-[0_0_0_1px_inset_rgba(0,0,0,0.03)]' : '',
                        )}
                    >
                        {/* Pending overlay spinner */}
                        <AnimatePresence>
                            {isPending && (
                                <motion.span
                                    key="spinner"
                                    initial={{opacity: 0, scale: 0.9}}
                                    animate={{opacity: 1, scale: 1, transition: spring}}
                                    exit={{opacity: 0, scale: 0.9, transition: {duration: 0.1}}}
                                    className="absolute inset-0 grid place-items-center pointer-events-none"
                                    aria-hidden="true"
                                >
                                    <Loader2 className="h-4 w-4 animate-spin"/>
                                </motion.span>
                            )}
                        </AnimatePresence>

                        {/* Icon/content */}
                        <span
                            className={classNames(
                                'inline-flex items-center gap-1',
                                isPending ? 'opacity-0' : 'opacity-100',
                            )}
                        >
              {children}
            </span>
                    </Button>
                </motion.div>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{tooltip}</TooltipContent>
        </Tooltip>
    );
}

/* --------------------------------------------------------------------------------
 * Copy Button (animated confirm state)
 * -------------------------------------------------------------------------------- */

function useTransientFlag(durationMs = 1500) {
    const [flag, setFlag] = useState(false);
    const timer = useRef<number | null>(null);

    const trigger = useCallback(() => {
        setFlag(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFlag(false), durationMs);
    }, [durationMs]);

    useEffect(() => {
        return () => {
            if (timer.current) window.clearTimeout(timer.current);
        };
    }, []);

    return [flag, trigger] as const;
}

/* --------------------------------------------------------------------------------
 * Main actions component
 * -------------------------------------------------------------------------------- */

export function PureMessageActions({
                                       chatId,
                                       message,
                                       vote,
                                       isLoading,
                                   }: {
    chatId: string;
    message: ChatMessage;
    vote: Vote | undefined;
    isLoading: boolean;
}) {
    const {mutate} = useSWRConfig();
    const [, copyToClipboard] = useCopyToClipboard();

    // Pending state for vote requests
    const [pending, setPending] = useState<null | 'up' | 'down'>(null);
    const isUpActive = Boolean(vote?.isUpvoted);
    const isDownActive = vote ? !vote.isUpvoted : false;

    // Nice “Copied!” confirmation swap
    const [copied, triggerCopied] = useTransientFlag(1400);

    // Early outs (after hooks to keep hook order stable across renders)
    if (isLoading) return null;
    if (message.role === 'user') return null;

    const getMessageText = () =>
        message.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n')
            .trim() ?? '';

    const onCopy = async () => {
        const text = getMessageText();
        if (!text) {
            toast.error("There's no text to copy!");
            return;
        }
        await copyToClipboard(text);
        triggerCopied();
        toast.success('Copied to clipboard!');
    };

    const optimisticUpdate = (isUpvote: boolean) => {
        mutate<Array<Vote>>(
            `/api/vote?chatId=${chatId}`,
            (currentVotes) => {
                const votes = currentVotes ?? [];
                const withoutCurrent = votes.filter((v) => v.messageId !== message.id);
                return [...withoutCurrent, {chatId, messageId: message.id, isUpvoted: isUpvote}];
            },
            {revalidate: false},
        );
    };

    const voteRequest = async (type: 'up' | 'down') => {
        setPending(type);
        const req = fetch('/api/vote', {
            method: 'PATCH',
            body: JSON.stringify({
                chatId,
                messageId: message.id,
                type,
            }),
        });

        toast.promise(req, {
            loading: type === 'up' ? 'Upvoting…' : 'Downvoting…',
            success: () => {
                optimisticUpdate(type === 'up');
                return type === 'up' ? 'Upvoted!' : 'Downvoted.';
            },
            error: 'Vote failed. Please try again.',
        });

        try {
            await req;
        } finally {
            setPending(null);
        }
    };

    const onUpvote = async () => {
        if (isUpActive) return;
        await voteRequest('up');
    };

    const onDownvote = async () => {
        if (isDownActive) return;
        await voteRequest('down');
    };

    return (
        <TooltipProvider delayDuration={0}>
            <motion.div
                className="flex flex-row items-center gap-2"
                variants={fadeVariants}
                initial="hidden"
                animate="show"
                exit="exit"
                layout
                transition={spring}
                aria-label="Assistant message actions"
            >
                {/* Copy */}
                <ActionButton
                    tooltip={copied ? 'Copied' : 'Copy'}
                    ariaLabel="Copy message text"
                    onClick={onCopy}
                    isActive={copied}
                    tone={copied ? 'brand' : 'neutral'}
                >
                    <AnimatePresence initial={false} mode="wait">
                        {copied ? (
                            <motion.span
                                key="copied"
                                initial={{opacity: 0, y: 3, scale: 0.98}}
                                animate={{opacity: 1, y: 0, scale: 1, transition: spring}}
                                exit={{opacity: 0, y: -3, scale: 0.98, transition: {duration: 0.12}}}
                                className="inline-flex items-center gap-1"
                            >
                                <Check className="h-4 w-4" aria-hidden="true"/>
                                <span className="sr-only">Copied</span>
                            </motion.span>
                        ) : (
                            <motion.span
                                key="copy"
                                initial={{opacity: 0, y: 3, scale: 0.98}}
                                animate={{opacity: 1, y: 0, scale: 1, transition: spring}}
                                exit={{opacity: 0, y: -3, scale: 0.98, transition: {duration: 0.12}}}
                                className="inline-flex items-center"
                            >
                                <ClipboardCopy className="h-4 w-4" aria-hidden="true"/>
                                <span className="sr-only">Copy</span>
                            </motion.span>
                        )}
                    </AnimatePresence>
                </ActionButton>

                {/* Upvote */}
                <ActionButton
                    data-testid="message-upvote"
                    tooltip={isUpActive ? 'Upvoted' : 'Upvote response'}
                    ariaLabel="Upvote response"
                    onClick={onUpvote}
                    disabled={Boolean(pending) || isUpActive}
                    isActive={isUpActive}
                    isPending={pending === 'up'}
                    tone="success"
                >
                    <ThumbsUp className="h-4 w-4" aria-hidden="true"/>
                    <span className="sr-only">{isUpActive ? 'Upvoted' : 'Upvote'}</span>
                </ActionButton>

                {/* Downvote */}
                <ActionButton
                    data-testid="message-downvote"
                    tooltip={isDownActive ? 'Downvoted' : 'Downvote response'}
                    ariaLabel="Downvote response"
                    onClick={onDownvote}
                    disabled={Boolean(pending) || isDownActive}
                    isActive={isDownActive}
                    isPending={pending === 'down'}
                    tone="danger"
                >
                    <ThumbsDown className="h-4 w-4" aria-hidden="true"/>
                    <span className="sr-only">{isDownActive ? 'Downvoted' : 'Downvote'}</span>
                </ActionButton>

                {/* Live region for accessibility announcements */}
                <output aria-live="polite" className="sr-only">
                    {pending === 'up'
                        ? 'Submitting upvote'
                        : pending === 'down'
                            ? 'Submitting downvote'
                            : ''}
                    {copied ? 'Copied to clipboard' : ''}
                </output>
            </motion.div>
        </TooltipProvider>
    );
}

export const MessageActions = memo(
    PureMessageActions,
    (prevProps, nextProps) => {
        if (!equal(prevProps.vote, nextProps.vote)) return false;
        if (prevProps.isLoading !== nextProps.isLoading) return false;
        return true;
    },
);