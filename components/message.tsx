'use client';
import cx from 'classnames';
import {AnimatePresence, motion} from 'framer-motion';
import {memo, useCallback, useMemo, useRef, useState} from 'react';
import type {Vote} from '@/lib/db/schema';
import {DocumentToolCall, DocumentToolResult} from './document';
import {PencilEditIcon, SparklesIcon} from './common/icons';
import {Markdown} from './markdown/markdown';
import {MessageActions} from './message-actions';
import {PreviewAttachment} from './preview-attachment';
import equal from 'fast-deep-equal';
import {cn, sanitizeText} from '@/lib/utils';
import {Button} from './ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from './ui/tooltip';
import {MessageEditor} from './message-editor';
import {DocumentPreview} from './document-preview';
import {MessageReasoning} from './message-reasoning';
import type {UseChatHelpers} from '@ai-sdk/react';
import type {ChatMessage} from '@/lib/types';
import {useDataStream} from './data-stream-provider';

// new imports for copy UX
import {useCopyToClipboard} from 'usehooks-ts';
import {ClipboardCopy, Check} from 'lucide-react';
import {toast} from 'sonner';

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */

/* -------------------------------------------------------------------------- */

function getTextFromMessage(message: ChatMessage) {
    return (
        message.parts
            ?.filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n')
            .trim() ?? ''
    );
}

// ephemeral flag for brief success swap animation
function useTransientFlag(durationMs = 1400) {
    const [flag, setFlag] = useState(false);
    const timer = useRef<number | null>(null);

    const trigger = useCallback(() => {
        setFlag(true);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setFlag(false), durationMs);
    }, [durationMs]);

    // cleanup on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useMemo(() => () => timer.current && window.clearTimeout(timer.current), []);

    return [flag, trigger] as const;
}

/* -------------------------------------------------------------------------- */
/* Copy Button for USER messages                                              */
/* - Selection-aware: copies selection if any                                 */
/* - Shift+Click: copies as Markdown quote (prefixed with `> `)               */
/* - Subtle, professional micro-animations                                    */

/* -------------------------------------------------------------------------- */

function UserCopyButton({
                            message,
                            className,
                        }: {
    message: ChatMessage;
    className?: string;
}) {
    const [, copyToClipboard] = useCopyToClipboard();
    const [copied, triggerCopied] = useTransientFlag(1200);

    const copySelectedOrWhole = useCallback(
        async (opts?: { asQuote?: boolean }) => {
            // 1) Try selection first (nice for copying snippets)
            const selected =
                typeof window !== 'undefined'
                    ? (window.getSelection?.()?.toString() ?? '').trim()
                    : '';

            // 2) Otherwise, copy the whole user message (text parts only)
            let text = selected || getTextFromMessage(message);

            if (!text) {
                toast.error("There's no text to copy!");
                return;
            }

            if (opts?.asQuote) {
                text = text
                    .split('\n')
                    .map((line) => (line.length ? `> ${line}` : '>'))
                    .join('\n');
            }

            try {
                await copyToClipboard(text);
                triggerCopied();
                toast.success('Copied to clipboard!');
            } catch {
                // Very rare: in case the hook fails for any reason
                try {
                    await navigator.clipboard.writeText(text);
                    triggerCopied();
                    toast.success('Copied to clipboard!');
                } catch {
                    toast.error('Copy failed. Please try again.');
                }
            }
        },
        [copyToClipboard, message, triggerCopied],
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    className={cx(
                        'px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100 transition-opacity',
                        className,
                    )}
                    onClick={(e) => {
                        const asQuote = e.shiftKey; // Shift+Click => copy as Markdown quote
                        void copySelectedOrWhole({asQuote});
                    }}
                    aria-label="Copy message (⇧ for quote)"
                >
                    <AnimatePresence initial={false} mode="wait">
                        {copied ? (
                            <motion.span
                                key="copied"
                                initial={{opacity: 0, y: 2, scale: 0.98}}
                                animate={{opacity: 1, y: 0, scale: 1}}
                                exit={{opacity: 0, y: -2, scale: 0.98}}
                                transition={{type: 'spring', stiffness: 500, damping: 28}}
                                className="inline-flex"
                            >
                                <Check className="h-4 w-4"/>
                            </motion.span>
                        ) : (
                            <motion.span
                                key="copy"
                                initial={{opacity: 0, y: 2, scale: 0.98}}
                                animate={{opacity: 1, y: 0, scale: 1}}
                                exit={{opacity: 0, y: -2, scale: 0.98}}
                                transition={{type: 'spring', stiffness: 500, damping: 28}}
                                className="inline-flex"
                            >
                                <ClipboardCopy className="h-4 w-4"/>
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Button>
            </TooltipTrigger>
            <TooltipContent>Copy (⇧ for Quote)</TooltipContent>
        </Tooltip>
    );
}

/* -------------------------------------------------------------------------- */
/* Message                                                                    */
/* -------------------------------------------------------------------------- */

// Type narrowing is handled by TypeScript's control flow analysis
// The AI SDK provides proper discriminated unions for tool calls

const PurePreviewMessage = ({
                                chatId,
                                message,
                                vote,
                                isLoading,
                                setMessages,
                                regenerate,
                                isReadonly,
                                requiresScrollPadding,
                            }: {
    chatId: string;
    message: ChatMessage;
    vote: Vote | undefined;
    isLoading: boolean;
    setMessages: UseChatHelpers<ChatMessage>['setMessages'];
    regenerate: UseChatHelpers<ChatMessage>['regenerate'];
    isReadonly: boolean;
    requiresScrollPadding: boolean;
}) => {
    const [mode, setMode] = useState<'view' | 'edit'>('view');

    const attachmentsFromMessage = message.parts.filter(
        (part) => part.type === 'file',
    );

    useDataStream();

    return (
        <AnimatePresence>
            <motion.div
                data-testid={`message-${message.role}`}
                className="w-full mx-auto max-w-3xl px-4 group/message"
                initial={{y: 5, opacity: 0}}
                animate={{y: 0, opacity: 1}}
                data-role={message.role}
            >
                <div
                    className={cn(
                        'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
                        {
                            'w-full': mode === 'edit',
                            'group-data-[role=user]/message:w-fit': mode !== 'edit',
                        },
                    )}
                >
                    {message.role === 'assistant' && (
                        <div
                            className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
                            <div className="translate-y-px">
                                <SparklesIcon size={14}/>
                            </div>
                        </div>
                    )}

                    <div
                        className={cn('flex flex-col gap-4 w-full', {
                            'min-h-96': message.role === 'assistant' && requiresScrollPadding,
                        })}
                    >
                        {attachmentsFromMessage.length > 0 && (
                            <div
                                data-testid={`message-attachments`}
                                className="flex flex-row justify-end gap-2"
                            >
                                {attachmentsFromMessage.map((attachment) => (
                                    <PreviewAttachment
                                        key={attachment.url}
                                        attachment={{
                                            name: attachment.filename ?? 'file',
                                            contentType: attachment.mediaType,
                                            url: attachment.url,
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {message.parts?.map((part, index) => {
                            const {type} = part;
                            const key = `message-${message.id}-part-${index}`;

                            if (type === 'reasoning' && part.text?.trim().length > 0) {
                                return (
                                    <MessageReasoning
                                        key={key}
                                        isLoading={isLoading}
                                        reasoning={part.text}
                                    />
                                );
                            }

                            if (type === 'text') {
                                if (mode === 'view') {
                                    return (
                                        <div key={key} className="flex flex-row gap-2 items-start">
                                            {/* ACTIONS next to USER message: Copy + Edit (on hover) */}
                                            {message.role === 'user' && !isReadonly && (
                                                <>
                                                    <UserCopyButton message={message}/>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                data-testid="message-edit-button"
                                                                variant="ghost"
                                                                className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100 transition-opacity"
                                                                onClick={() => {
                                                                    setMode('edit');
                                                                }}
                                                                aria-label="Edit message"
                                                            >
                                                                <PencilEditIcon/>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>Edit message</TooltipContent>
                                                    </Tooltip>
                                                </>
                                            )}

                                            {/* Content bubble */}
                                            <div
                                                data-testid="message-content"
                                                className={cn('flex flex-col gap-4', {
                                                    'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                                                        message.role === 'user',
                                                })}
                                            >
                                                <Markdown>{sanitizeText(part.text)}</Markdown>
                                            </div>
                                        </div>
                                    );
                                }

                                if (mode === 'edit') {
                                    return (
                                        <div key={key} className="flex flex-row gap-2 items-start">
                                            <div className="size-8"/>
                                            <MessageEditor
                                                key={message.id}
                                                message={message}
                                                setMode={setMode}
                                                setMessages={setMessages}
                                                regenerate={regenerate}
                                            />
                                        </div>
                                    );
                                }
                            }

                            if (type === 'tool-createDocument') {
                                const {toolCallId, state} = part;

                                if (state === 'input-available') {
                                    const {input} = part;
                                    return (
                                        <div key={toolCallId}>
                                            <DocumentPreview isReadonly={isReadonly} args={input}/>
                                        </div>
                                    );
                                }

                                if (state === 'output-available') {
                                    const {output} = part;

                                    if ('error' in output) {
                                        return (
                                            <div
                                                key={toolCallId}
                                                className="text-red-500 p-2 border rounded"
                                            >
                                                Error: {String(output.error)}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={toolCallId}>
                                            <DocumentToolResult
                                                type="create"
                                                result={output}
                                                isReadonly={isReadonly}
                                            />
                                        </div>
                                    );
                                }
                            }

                            if (type === 'tool-updateDocument') {
                                const {toolCallId, state} = part;

                                if (state === 'input-available') {
                                    const {input} = part;

                                    return (
                                        <div key={toolCallId}>
                                            <DocumentToolCall
                                                type="update"
                                                args={input}
                                                isReadonly={isReadonly}
                                            />
                                        </div>
                                    );
                                }

                                if (state === 'output-available') {
                                    const {output} = part;

                                    if ('error' in output) {
                                        return (
                                            <div
                                                key={toolCallId}
                                                className="text-red-500 p-2 border rounded"
                                            >
                                                Error: {String(output.error)}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={toolCallId}>
                                            <DocumentToolResult
                                                type="update"
                                                result={output}
                                                isReadonly={isReadonly}
                                            />
                                        </div>
                                    );
                                }
                            }

                            if (type === 'tool-requestSuggestions') {
                                const {toolCallId, state} = part;

                                if (state === 'input-available') {
                                    const {input} = part;
                                    return (
                                        <div key={toolCallId}>
                                            <DocumentToolCall
                                                type="request-suggestions"
                                                args={input}
                                                isReadonly={isReadonly}
                                            />
                                        </div>
                                    );
                                }

                                if (state === 'output-available') {
                                    const {output} = part;

                                    if ('error' in output) {
                                        return (
                                            <div
                                                key={toolCallId}
                                                className="text-red-500 p-2 border rounded"
                                            >
                                                Error: {String(output.error)}
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={toolCallId}>
                                            <DocumentToolResult
                                                type="request-suggestions"
                                                result={output}
                                                isReadonly={isReadonly}
                                            />
                                        </div>
                                    );
                                }
                            }
                        })}

                        {/* Assistant action bar (votes, copy) — keep as-is */}
                        {!isReadonly && message.role === 'assistant' && (
                            <MessageActions
                                key={`action-${message.id}`}
                                chatId={chatId}
                                message={message}
                                vote={vote}
                                isLoading={isLoading}
                            />
                        )}

                        {/* Live region for a11y announcements (copy/edit) */}
                        <output aria-live="polite" className="sr-only">
                            {message.role === 'user'
                                ? 'User message actions available: copy and edit.'
                                : 'Assistant message actions available.'}
                        </output>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export const PreviewMessage = memo(
    PurePreviewMessage,
    (prevProps, nextProps) => {
        if (prevProps.isLoading !== nextProps.isLoading) return false;
        if (prevProps.message.id !== nextProps.message.id) return false;
        if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
            return false;
        if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
        if (!equal(prevProps.vote, nextProps.vote)) return false;

        return false;
    },
);

export const ThinkingMessage = () => {
    const role = 'assistant';

    return (
        <motion.div
            data-testid="message-assistant-loading"
            className="w-full mx-auto max-w-3xl px-4 group/message"
            initial={{y: 5, opacity: 0}}
            animate={{y: 0, opacity: 1, transition: {delay: 0.2}}}
            data-role={role}
            aria-live="polite"
        >
            <div
                className={cx(
                    'flex gap-4 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
                )}
            >
                <div
                    className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
                    <div className="translate-y-px">
                        <SparklesIcon size={14}/>
                    </div>
                </div>

                <div className="flex flex-col gap-3 w-full">
                    {/* Typing dots bubble */}
                    <div
                        className="w-fit bg-muted text-muted-foreground px-3 py-2 rounded-xl border dark:border-zinc-700">
                        <div className="flex items-center gap-1.5">
              <span
                  className="inline-block size-2 rounded-full bg-muted-foreground/60 animate-pulse"
                  style={{animationDelay: '0ms'}}
              />
                            <span
                                className="inline-block size-2 rounded-full bg-muted-foreground/60 animate-pulse"
                                style={{animationDelay: '120ms'}}
                            />
                            <span
                                className="inline-block size-2 rounded-full bg-muted-foreground/60 animate-pulse"
                                style={{animationDelay: '240ms'}}
                            />
                        </div>
                        <span className="sr-only">Assistant is preparing a response…</span>
                    </div>

                    {/* Subtle skeleton lines to indicate upcoming content */}
                    <div className="flex flex-col gap-2">
                        <div className="h-3 w-2/3 rounded bg-muted-foreground/20 animate-pulse"/>
                        <div className="h-3 w-5/6 rounded bg-muted-foreground/20 animate-pulse"/>
                        <div className="h-3 w-3/5 rounded bg-muted-foreground/20 animate-pulse"/>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};