import {put} from '@vercel/blob';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {authOrDev} from '@/lib/auth/auth';

/**
 * Configuration
 */
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
]);

// You can tune this via env in different deployments
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? '10');
const MAX_UPLOAD_BYTES = Math.max(1, Math.min(100, MAX_UPLOAD_MB)) * 1024 * 1024; // clamp 1..100MB

/**
 * Utility: sanitize filename to avoid path tricks & weird chars
 */
function sanitizeFilename(name: string, fallbackBase = 'upload'): string {
    // keep only safe chars; collapse spaces; limit length
    const base = (name || '')
        .replace(/[/\\?%*:|"<>]/g, '-') // path & reserved
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || fallbackBase;

    return base;
}

/**
 * Utility: map a content-type to a safe extension
 */
function extensionForContentType(ct: string): string {
    switch (ct) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'application/pdf':
            return '.pdf';
        default:
            return '';
    }
}

/**
 * Utility: very small magic-byte sniffer to defend against spoofed MIME
 *  - JPEG: FF D8 FF
 *  - PNG:  89 50 4E 47 0D 0A 1A 0A
 *  - PDF:  25 50 44 46 2D ("%PDF-")
 */
function sniffMimeFromBuffer(buf: Uint8Array): string | null {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
        return 'image/jpeg';
    }
    if (
        buf.length >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a
    ) {
        return 'image/png';
    }
    if (
        buf.length >= 5 &&
        buf[0] === 0x25 && // %
        buf[1] === 0x50 && // P
        buf[2] === 0x44 && // D
        buf[3] === 0x46 && // F
        buf[4] === 0x2d // -
    ) {
        return 'application/pdf';
    }
    return null;
}

/**
 * Zod schema for basic validation before we read the whole buffer.
 * (We still re-validate after reading to enforce magic bytes and size.)
 */
const FileSchema = z.object({
    file: z
        .instanceof(Blob)
        .refine((f) => f.size > 0, {message: 'File is empty'})
        .refine((f) => f.size <= MAX_UPLOAD_BYTES, {
            message: `File size should be ≤ ${MAX_UPLOAD_MB}MB`,
        })
        .refine((f) => ALLOWED_MIME_TYPES.has(f.type), {
            message: `Unsupported file type. Allowed: ${Array.from(ALLOWED_MIME_TYPES).join(', ')}`,
        }),
});

export async function POST(request: Request) {
    // Require authenticated user (authOrDev returns a DB-backed session in dev)
    const session = await authOrDev();
    if (!session?.user?.id) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    if (!request.body) {
        return NextResponse.json({error: 'Request body is empty'}, {status: 400});
    }

    try {
        const formData = await request.formData();
        const fileEntry = formData.get('file');

        if (!fileEntry || !(fileEntry instanceof Blob)) {
            return NextResponse.json({error: 'No file uploaded'}, {status: 400});
        }

        // Fast path prechecks
        const precheck = FileSchema.safeParse({file: fileEntry});
        if (!precheck.success) {
            const message = precheck.error.errors.map((e) => e.message).join(', ');
            return NextResponse.json({error: message}, {status: 400});
        }

        // Read full buffer once (small uploads only; we enforce MAX_UPLOAD_BYTES)
        const file = fileEntry as Blob;
        const arrayBuf = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuf);

        // Enforce size again server-side (defense-in-depth)
        if (uint8.byteLength > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                {error: `File exceeds size limit of ${MAX_UPLOAD_MB}MB`},
                {status: 413}, // Payload Too Large
            );
        }

        // Magic byte sniffing to confirm declared MIME
        const sniffed = sniffMimeFromBuffer(uint8);
        if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed)) {
            return NextResponse.json(
                {error: 'File content does not match a supported type (JPEG, PNG, PDF)'},
                {status: 415}, // Unsupported Media Type
            );
        }

        // Final content type to persist
        const contentType = sniffed;

        // Filename: prefer provided name if present; otherwise derive one
        const originalName = (file as unknown as File)?.name ?? '';
        const safeBase = sanitizeFilename(originalName.replace(/\.[^.]+$/g, ''));
        const ext = extensionForContentType(contentType);
        const finalName = `${safeBase || 'upload'}${ext}`.toLowerCase();

        // Cache policy: long-lived for immutable blobs
        const cacheControl =
            contentType === 'application/pdf'
                ? 'public, max-age=31536000, immutable'
                : 'public, max-age=31536000, immutable';

        // Upload to Vercel Blob with a random suffix to avoid collisions.
        // `put` automatically uses BLOB_READ_WRITE_TOKEN locally if set.
        const blob = await put(finalName, arrayBuf, {
            access: 'public',
            contentType,
            cacheControl,
            addRandomSuffix: true,
        });

        // Minimal response; avoid echoing back untrusted filename data
        return NextResponse.json(
            {
                url: blob.url,
                pathname: blob.pathname,
                size: uint8.byteLength,
                contentType,
                uploadedBy: session.user.id,
            },
            {status: 200},
        );
    } catch (err: unknown) {
        // Avoid leaking internal errors; return generic message
        return NextResponse.json(
            {error: 'Failed to process upload'},
            {status: 500},
        );
    }
}