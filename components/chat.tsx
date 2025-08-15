'use client';

import {DefaultChatTransport} from 'ai';
import {useChat} from '@ai-sdk/react';
import {useEffect, useMemo, useRef, useState} from 'react';
import useSWR, {useSWRConfig} from 'swr';
import {ChatHeader} from '@/components/chat-header';
import type {Vote} from '@/lib/db/schema';
import {fetcher, fetchWithErrorHandlers, generateUUID} from '@/lib/utils';
import {Artifact} from './artifact';
import {MultimodalInput} from './multimodal-input';
import {Messages} from './messages';
import type {VisibilityType} from './visibility-selector';
import {useArtifactSelector} from '@/hooks/use-artifact';
import {unstable_serialize} from 'swr/infinite';
import {getChatHistoryPaginationKey} from './sidebar-history';
import {toast} from './toast';
import type {Session} from 'next-auth';
import {useSearchParams} from 'next/navigation';
import {useChatVisibility} from '@/hooks/use-chat-visibility';
import {useAutoResume} from '@/hooks/use-auto-resume';
import {ChatSDKError} from '@/lib/errors';
import type {Attachment, ChatMessage} from '@/lib/types';
import {useDataStream} from './data-stream-provider';

import {chatModels, DEFAULT_CHAT_MODEL} from '@/lib/ai/models';

/* ---------------- UI smoothing helpers (UI-only; no server changes) ---------------- */

/** Throttle a string so React only updates at most every `intervalMs` (≈45–60fps). */
function useThrottledText(text: string, intervalMs = 200) {
    const [display, setDisplay] = useState(text);
    const lastSetRef = useRef(0);
    const latestRef = useRef(text);

    useEffect(() => {
        latestRef.current = text;
        const now = performance.now();
        const elapsed = now - lastSetRef.current;

        if (elapsed >= intervalMs) {
            lastSetRef.current = now;
            setDisplay(latestRef.current);
            return;
        }

        const id = window.setTimeout(() => {
            lastSetRef.current = performance.now();
            setDisplay(latestRef.current);
        }, Math.max(0, intervalMs - elapsed));

        return () => window.clearTimeout(id);
    }, [text, intervalMs]);

    return display;
}

/** Avoid flashing tiny unfinished word tails like "hel", "int", etc. */
function coalesceTail(raw: string, minTail = 3) {
    const m = /([^\s\.,!?;:])+$/.exec(raw);
    if (!m) return raw;
    const frag = m[0];
    if (frag.length > 0 && frag.length < minTail) {
        return raw.slice(0, -frag.length);
    }
    return raw;
}

/** Pull the text of the last text-part in a ChatMessage (if any). */
function getLastTextPart(message: ChatMessage) {
    if (!message?.parts?.length) return {index: -1, text: ''};
    for (let i = message.parts.length - 1; i >= 0; i--) {
        const p = message.parts[i] as any;
        if (p && p.type === 'text' && typeof p.text === 'string') {
            return {index: i, text: p.text as string};
        }
    }
    return {index: -1, text: ''};
}

/**
 * Return a UI-smoothed messages array:
 * - Only affects the currently streaming assistant message.
 * - Replaces its last text-part with a throttled/coalesced string for rendering.
 * - Leaves the actual chat state untouched.
 */
function useSmoothedMessages(messages: ChatMessage[], status: string) {
    // Identify the latest assistant message.
    const lastAssistantIndex = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'assistant') return i;
        }
        return -1;
    }, [messages]);

    const lastAssistant = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;

    // If not streaming or no assistant message, pass through.
    const shouldSmooth = status === 'streaming' && !!lastAssistant;

    // Extract raw text for smoothing.
    const {index: lastTextIndex, text: rawText} = useMemo(() => {
        return lastAssistant ? getLastTextPart(lastAssistant) : {index: -1, text: ''};
    }, [lastAssistant]);

    // Coalesce tiny tails to avoid micro-jitter, then throttle paints.
    const coalesced = useMemo(() => coalesceTail(rawText, 3), [rawText]);
    const throttled = useThrottledText(coalesced, 22);

    // Build a cloned messages array with only the visible text changed.
    const smoothed = useMemo(() => {
        if (!shouldSmooth || lastAssistantIndex < 0 || lastTextIndex < 0) return messages;

        const cloned = messages.slice();
        const m = {...cloned[lastAssistantIndex]} as ChatMessage & { parts: any[] };
        const parts = m.parts.slice();
        const p = {...parts[lastTextIndex], text: throttled};
        parts[lastTextIndex] = p;
        m.parts = parts;
        cloned[lastAssistantIndex] = m;

        return cloned;
    }, [messages, shouldSmooth, lastAssistantIndex, lastTextIndex, throttled]);

    // When stream stops, immediately return the true messages (no throttling).
    return shouldSmooth ? smoothed : messages;
}

/* -------------------------------- Chat component --------------------------------- */

export function Chat({
                         id,
                         initialMessages,
                         initialChatModel,
                         initialVisibilityType,
                         isReadonly,
                         session,
                         autoResume,
                     }: {
    id: string;
    initialMessages: ChatMessage[];
    initialChatModel: string;
    initialVisibilityType: VisibilityType;
    isReadonly: boolean;
    session: Session;
    autoResume: boolean;
}) {
    const {visibilityType} = useChatVisibility({
        chatId: id,
        initialVisibilityType,
    });

    const validModelIds = new Set(chatModels.map((m) => m.id));
    const safeModelId =
        validModelIds.has(initialChatModel) ? initialChatModel : DEFAULT_CHAT_MODEL;

    const {mutate} = useSWRConfig();
    const {setDataStream} = useDataStream();

    const [input, setInput] = useState<string>('');

    const {
        messages,
        setMessages,
        sendMessage,
        status,
        stop,
        regenerate,
        resumeStream,
    } = useChat<ChatMessage>({
        id,
        messages: initialMessages,
        // Lower from 100ms → 20ms for smoother UI updates during token streams.
        // (We still add a local 22ms UI throttle below to prevent over-rendering.)
        experimental_throttle: 20,
        generateId: generateUUID,
        transport: new DefaultChatTransport({
            api: '/api/chat',
            fetch: fetchWithErrorHandlers,
            prepareSendMessagesRequest({messages, id, body}) {
                return {
                    body: {
                        id,
                        message: messages.at(-1),
                        selectedChatModel: safeModelId,
                        selectedVisibilityType: visibilityType,
                        ...body,
                    },
                };
            },
        }),
        onData: (dataPart) => {
            setDataStream((ds) => (ds ? [...ds, dataPart] : []));
        },
        onFinish: () => {
            // Update history after the last token lands.
            mutate(unstable_serialize(getChatHistoryPaginationKey));
        },
        onError: (error) => {
            if (error instanceof ChatSDKError) {
                toast({
                    type: 'error',
                    description: error.message,
                });
            }
        },
    });

    const searchParams = useSearchParams();
    const query = searchParams.get('query');

    const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

    useEffect(() => {
        if (query && !hasAppendedQuery) {
            sendMessage({
                role: 'user' as const,
                parts: [{type: 'text', text: query}],
            });

            setHasAppendedQuery(true);
            window.history.replaceState({}, '', `/chat/${id}`);
        }
    }, [query, sendMessage, hasAppendedQuery, id]);

    const {data: votes} = useSWR<Array<Vote>>(
        messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
        fetcher,
    );

    const [attachments, setAttachments] = useState<Array<Attachment>>([]);
    const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

    useAutoResume({
        autoResume,
        initialMessages,
        resumeStream,
        setMessages,
    });

    // Use the UI-smoothed message list strictly for rendering the thread.
    const displayMessages = useSmoothedMessages(messages, status);

    return (
        <>
            <div className="flex flex-col min-w-0 h-dvh bg-background">
                <ChatHeader
                    chatId={id}
                    selectedModelId={initialChatModel}
                    selectedVisibilityType={initialVisibilityType}
                    isReadonly={isReadonly}
                    session={session}
                />

                <Messages
                    chatId={id}
                    status={status}
                    votes={votes}
                    messages={displayMessages}
                    setMessages={setMessages}
                    regenerate={regenerate}
                    isReadonly={isReadonly}
                    isArtifactVisible={isArtifactVisible}
                />

                <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
                    {!isReadonly && (
                        <MultimodalInput
                            chatId={id}
                            input={input}
                            setInput={setInput}
                            status={status}
                            stop={stop}
                            attachments={attachments}
                            setAttachments={setAttachments}
                            messages={messages}
                            setMessages={setMessages}
                            sendMessage={sendMessage}
                            selectedVisibilityType={visibilityType}
                        />
                    )}
                </form>
            </div>

            <Artifact
                chatId={id}
                input={input}
                setInput={setInput}
                status={status}
                stop={stop}
                attachments={attachments}
                setAttachments={setAttachments}
                sendMessage={sendMessage}
                messages={messages}
                setMessages={setMessages}
                regenerate={regenerate}
                votes={votes}
                isReadonly={isReadonly}
                selectedVisibilityType={visibilityType}
            />
        </>
    );
}