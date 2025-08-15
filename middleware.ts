// middleware.ts
import {NextResponse} from 'next/server';
import {getToken} from 'next-auth/jwt';

const CANON_HOST = 'chat.medbrevia.com';

// Protect everything except static & API assets
export const config = {
    matcher: ['/((?!api|_next/static|_next/image|assets|favicon.ico).*)'],
};

export async function middleware(req: any) {
    const url = new URL(req.url);

    // Canonicalize to chat subdomain in production
    if (process.env.NODE_ENV === 'production' && url.hostname !== CANON_HOST) {
        url.hostname = CANON_HOST;
        return NextResponse.redirect(url);
    }

    // In development, don't force cross-domain login (cookie isn't shared on localhost)
    if (process.env.NODE_ENV !== 'production') {
        return NextResponse.next();
    }

    // Require authentication in production
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';
    const token = await getToken({req, secret});
    if (!token?.sub) {
        const loginUrl = new URL('https://medbrevia.com/account/login');
        loginUrl.searchParams.set('callbackUrl', url.toString());
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}