import {z} from 'zod';
import {MAX_MESSAGE_CHARS} from "@/lib/constants";

/**
 * Text part with built-in trimming + per-part bounds.
 */
const textPartSchema = z.object({
    type: z.literal('text'),
    text: z
        .string()
        .trim()
        .min(1, {message: 'Message cannot be empty.'})
        .max(MAX_MESSAGE_CHARS, {
            message: `Message is too long. Limit is ${MAX_MESSAGE_CHARS.toLocaleString()} characters.`,
        }),
});

/**
 * File part: allow images & PDFs (aligned with your upload route).
 */
const filePartSchema = z.object({
    type: z.literal('file'),
    mediaType: z.enum(['image/jpeg', 'image/png', 'application/pdf']),
    name: z.string().min(1).max(100),
    url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

/**
 * Message schema with total-length guard across all text parts.
 */
const messageSchema = z
    .object({
        id: z.string().uuid(),
        role: z.enum(['user']),
        parts: z.array(partSchema).min(1, {message: 'Message has no content.'}),
    })
    .superRefine((val, ctx) => {
        const totalChars = val.parts.reduce((sum, p) => {
            return p.type === 'text' ? sum + p.text.length : sum;
        }, 0);

        if (totalChars > MAX_MESSAGE_CHARS) {
            ctx.addIssue({
                code: z.ZodIssueCode.too_big,
                type: 'string',
                maximum: MAX_MESSAGE_CHARS,
                inclusive: true,
                path: ['parts'],
                message: `Your message is ${totalChars.toLocaleString()} characters; the limit is ${MAX_MESSAGE_CHARS.toLocaleString()}.`,
            });
        }
    });

export const postRequestBodySchema = z.object({
    id: z.string().uuid(),
    message: messageSchema,
    selectedChatModel: z.enum(['chat-model', 'chat-model-reasoning']),
    selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;