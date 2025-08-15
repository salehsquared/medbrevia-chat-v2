// app/(chat)/page.tsx
import {cookies} from 'next/headers';

import {Chat} from '@/components/chat';
import {DEFAULT_CHAT_MODEL} from '@/lib/ai/models';
import {generateUUID} from '@/lib/utils';
import {DataStreamHandler} from '@/components/data-stream-handler';
import {authOrDev} from '@/lib/auth/auth';
import {redirect} from 'next/navigation';

export default async function Page() {
    const session = await authOrDev();

    if (!session) {
        // Production-only redirect (authOrDev returns null only in prod)
        const host =
            process.env.NODE_ENV === 'production'
                ? 'https://chat.medbrevia.com'
                : 'http://localhost:3000';
        const callback = `${host}/`;
        redirect(
            `https://medbrevia.com/account/login?callbackUrl=${encodeURIComponent(
                callback,
            )}`,
        );
    }

    const id = generateUUID();

    const cookieStore = await cookies();
    const modelIdFromCookie = cookieStore.get('chat-model');

    if (!modelIdFromCookie) {
        return (
            <>
                <Chat
                    key={id}
                    id={id}
                    initialMessages={[]}
                    initialChatModel={DEFAULT_CHAT_MODEL}
                    initialVisibilityType="private"
                    isReadonly={false}
                    session={session}
                    autoResume={false}
                />
                <DataStreamHandler/>
            </>
        );
    }

    return (
        <>
            <Chat
                key={id}
                id={id}
                initialMessages={[]}
                initialChatModel={modelIdFromCookie.value}
                initialVisibilityType="private"
                isReadonly={false}
                session={session}
                autoResume={false}
            />
            <DataStreamHandler/>
        </>
    );
}