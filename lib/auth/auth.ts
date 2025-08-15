// lib/auth/auth.ts
import NextAuth from 'next-auth';
import type {Session} from 'next-auth';

// In dev we create/fetch a real user row so `session.user.id` is a real UUID
import {getUser, createUser} from '@/lib/db/queries';

const isProd = process.env.NODE_ENV === 'production';

export const {
    handlers: {GET, POST},
    auth,     // read real session when present (shared cookie from main site)
    signOut,  // server-side signOut helper if needed
} = NextAuth({
    // The chat app does not host sign-in; it only consumes the shared session cookie.
    providers: [],

    session: {strategy: 'jwt', maxAge: 12 * 60 * 60}, // 12h
    jwt: {maxAge: 12 * 60 * 60},

    // If someone tries to sign in on chat, send them to the main site.
    pages: {
        signIn: 'https://medbrevia.com/account/login',
    },

    // Use the same cookie config as the main app so we can read & clear it.
    cookies: {
        sessionToken: {
            name: '__Secure-authjs.session-token',
            options: {
                httpOnly: true,
                sameSite: 'lax',
                path: '/',
                secure: true,
                ...(isProd ? {domain: '.medbrevia.com'} : {}),
            },
        },
    },

    trustHost: true,
    // Must match the main site's secret
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

    callbacks: {
        // Pass through id when a real token exists (prod). For dev we set it in authOrDev().
        async session({session, token}) {
            if (session?.user && token?.sub) {
                // @ts-expect-error: augment at runtime
                session.user.id = token.sub;
            }
            return session;
        },
    },
});

/**
 * Dev-only helper that returns a *DB-backed* session:
 *  - In production: returns the real session (or null).
 *  - In development: if no real session cookie, ensures a user row exists
 *    and returns a session whose user.id is that row's UUID.
 */
export async function authOrDev(): Promise<Session | null> {
    const s = await auth();
    if (s) return s;

    if (!isProd) {
        const email = process.env.DEV_USER_EMAIL ?? 'dev@local';
        const password = process.env.DEV_USER_PASSWORD ?? 'dev-password';

        // Ensure there is a real DB user so foreign keys on Chat.userId, etc. work.
        let dbUser = (await getUser(email))[0];

        if (!dbUser) {
            await createUser(email, password);
            dbUser = (await getUser(email))[0];
        }

        // If we still couldn't create/read the dev user, fall back safely with a UUID-looking id.
        // (But inserts that require a valid FK will fail; so this is best-effort.)
        const fallbackId = '11111111-1111-1111-1111-111111111111';

        return {
            user: {
                id: dbUser?.id ?? fallbackId,
                email: dbUser?.email ?? email,
                name: 'Dev User',
                image: null,
                // not part of NextAuth's base type; components that need it should treat it as optional
                // @ts-expect-error custom field for app logic
                type: 'regular',
            },
            expires: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        } as unknown as Session;
    }

    return null;
}