// app/(chat)/chat/[id]/page.tsx
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { authOrDev } from '@/lib/auth/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { convertToUIMessages } from '@/lib/utils';

export default async function Page(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params;
    const chat = await getChatById({ id });

    if (!chat) {
        notFound();
    }

    const session = await authOrDev();

    if (!session) {
        const host =
            process.env.NODE_ENV === 'production'
                ? 'https://chat.medbrevia.com'
                : 'http://localhost:3000';
        const callback = `${host}/chat/${id}`;
        redirect(
            `https://medbrevia.com/account/login?callbackUrl=${encodeURIComponent(
                callback,
            )}`,
        );
    }

    if (chat.visibility === 'private') {
        if (!session.user) {
            return notFound();
        }

        if (session.user.id !== chat.userId) {
            return notFound();
        }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = convertToUIMessages(messagesFromDb);

    const cookieStore = await cookies();
    const chatModelFromCookie = cookieStore.get('chat-model');

    if (!chatModelFromCookie) {
        return (
            <>
                <Chat
                    id={chat.id}
                    initialMessages={uiMessages}
                    initialChatModel={DEFAULT_CHAT_MODEL}
                    initialVisibilityType={chat.visibility}
                    isReadonly={session?.user?.id !== chat.userId}
                    session={session}
                    autoResume={true}
                />
                <DataStreamHandler />
            </>
        );
    }

    return (
        <>
            <Chat
                id={chat.id}
                initialMessages={uiMessages}
                initialChatModel={chatModelFromCookie.value}
                initialVisibilityType={chat.visibility}
                isReadonly={session?.user?.id !== chat.userId}
                session={session}
                autoResume={true}
            />
            <DataStreamHandler />
        </>
    );
}
