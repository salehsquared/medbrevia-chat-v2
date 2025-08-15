import {
    convertToModelMessages,
    createUIMessageStream,
    JsonToSseTransformStream,
    smoothStream,
    stepCountIs,
    streamText,
} from 'ai';
import {authOrDev} from '@/lib/auth/auth';
import {type RequestHints, systemPrompt} from '@/lib/ai/prompts';
import {
    createStreamId,
    deleteChatById,
    getChatById,
    getMessageCountByUserId,
    getMessagesByChatId,
    saveChat,
    saveMessages,
} from '@/lib/db/queries';
import {convertToUIMessages, generateUUID} from '@/lib/utils';
import {generateTitleFromUserMessage} from '../../actions';
import {createDocument} from '@/lib/ai/tools/create-document';
import {updateDocument} from '@/lib/ai/tools/update-document';
import {requestSuggestions} from '@/lib/ai/tools/request-suggestions';
import {isProductionEnvironment} from '@/lib/constants';
import {myProvider} from '@/lib/ai/providers';
import {postRequestBodySchema, type PostRequestBody} from './schema';
import {geolocation} from '@vercel/functions';
import {
    createResumableStreamContext,
    type ResumableStreamContext,
} from 'resumable-stream';
import {after} from 'next/server';
import {ChatSDKError} from '@/lib/errors';
import type {ChatMessage} from '@/lib/types';
import type {ChatModel} from '@/lib/ai/models';
import type {VisibilityType} from '@/components/visibility-selector';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
    if (!globalStreamContext) {
        try {
            globalStreamContext = createResumableStreamContext({
                waitUntil: after,
            });
        } catch (error: any) {
            if (error.message.includes('REDIS_URL')) {
                console.log(
                    ' > Resumable streams are disabled due to missing REDIS_URL',
                );
            } else {
                console.error(error);
            }
        }
    }

    return globalStreamContext;
}

export async function POST(request: Request) {
    let requestBody: PostRequestBody;

    try {
        const json = await request.json();
        requestBody = postRequestBodySchema.parse(json);
    } catch (err) {
        console.log(err)
        return new ChatSDKError('bad_request:api').toResponse();
    }

    try {
        const {
            id,
            message,
            selectedChatModel,
            selectedVisibilityType,
        }: {
            id: string;
            message: ChatMessage;
            selectedChatModel: ChatModel['id'];
            selectedVisibilityType: VisibilityType;
        } = requestBody;

        const session = await authOrDev();

        if (!session?.user) {
            return new ChatSDKError('unauthorized:chat').toResponse();
        }

        // TODO: keep rate-limit logic gated behind an env flag in the future.

        const chat = await getChatById({id});

        if (!chat) {
            const title = await generateTitleFromUserMessage({
                message,
            });

            await saveChat({
                id,
                userId: session.user.id,
                title,
                visibility: selectedVisibilityType,
            });
        } else {
            if (chat.userId !== session.user.id) {
                return new ChatSDKError('forbidden:chat').toResponse();
            }
        }

        const messagesFromDb = await getMessagesByChatId({id});
        const uiMessages = [...convertToUIMessages(messagesFromDb), message];

        const {longitude, latitude, city, country} = geolocation(request);

        const requestHints: RequestHints = {
            longitude,
            latitude,
            city,
            country,
        };

        await saveMessages({
            messages: [
                {
                    chatId: id,
                    id: message.id,
                    role: 'user',
                    parts: message.parts,
                    attachments: [],
                    createdAt: new Date(),
                },
            ],
        });

        const streamId = generateUUID();
        await createStreamId({streamId, chatId: id});

        const stream = createUIMessageStream({
            execute: ({writer: dataStream}) => {
                const result = streamText({
                    model: myProvider.languageModel(selectedChatModel),
                    system: systemPrompt({selectedChatModel, requestHints}),
                    messages: convertToModelMessages(uiMessages),
                    stopWhen: stepCountIs(5),
                    experimental_activeTools:
                        selectedChatModel === 'chat-model-reasoning'
                            ? []
                            : ['createDocument', 'updateDocument', 'requestSuggestions'],
                    experimental_transform: smoothStream({chunking: 'word'}),
                    tools: {
                        createDocument: createDocument({session, dataStream}),
                        updateDocument: updateDocument({session, dataStream}),
                        requestSuggestions: requestSuggestions({
                            session,
                            dataStream,
                        }),
                    },
                    experimental_telemetry: {
                        isEnabled: isProductionEnvironment,
                        functionId: 'stream-text',
                    },
                });

                result.consumeStream();

                dataStream.merge(
                    result.toUIMessageStream({
                        sendReasoning: true,
                    }),
                );
            },
            generateId: generateUUID,
            onFinish: async ({messages}) => {
                await saveMessages({
                    messages: messages.map((message) => ({
                        id: message.id,
                        role: message.role,
                        parts: message.parts,
                        createdAt: new Date(),
                        attachments: [],
                        chatId: id,
                    })),
                });
            },
            onError: () => {
                return 'Oops, an error occurred!';
            },
        });

        const streamContext = getStreamContext();

        if (streamContext) {
            return new Response(
                await streamContext.resumableStream(streamId, () =>
                    stream.pipeThrough(new JsonToSseTransformStream()),
                ),
            );
        } else {
            return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
        }
    } catch (error) {
        if (error instanceof ChatSDKError) {
            console.log(error)
            return error.toResponse();
        }
    }
}

export async function DELETE(request: Request) {
    const {searchParams} = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return new ChatSDKError('bad_request:api').toResponse();
    }

    const session = await authOrDev();

    if (!session?.user) {
        return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const chat = await getChatById({id});

    if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
    }

    const deletedChat = await deleteChatById({id});

    return Response.json(deletedChat, {status: 200});
}
