'use client';

import {memo} from 'react';
import {useRouter} from 'next/navigation';
import {motion, AnimatePresence} from 'framer-motion';
import type {Session} from 'next-auth';

import {ModelSelector} from './model-selector';
import {SidebarToggle} from './sidebar-toggle';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipContent, TooltipTrigger} from './ui/tooltip';
import {type VisibilityType, VisibilitySelector} from './visibility-selector';

/** Icons — professional, modern set (lucide-react) */
import {
    Stethoscope,
    CircleHelp,
    ClipboardList,
    BadgeCheck,
    Lock,
    FilePlus2,
} from 'lucide-react';

/**
 * MedBrevia Chat Header
 * - Sidebar toggle is ALWAYS visible and pinned at far-left
 * - Left (next to toggle, md+): info tags (read-only/editable + case id)
 * - Right: visibility → model selector → New Case (rightmost)
 * - Brand chip appears on md+ without stealing space on small screens
 */

type Props = {
    chatId: string;
    selectedModelId: string;
    selectedVisibilityType: VisibilityType;
    isReadonly: boolean;
    session: Session;
};

/** Decorative: tiny animated separator */
const Separator = () => (
    <motion.span
        aria-hidden="true"
        className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 rounded-full mx-1 md:mx-2"
        initial={{scaleY: 0.6, opacity: 0}}
        animate={{scaleY: 1, opacity: 1}}
        transition={{type: 'spring', stiffness: 300, damping: 24}}
    />
);

/** Context badges: read-only state & case id (md+ only) */
function CaseContext({
                         chatId,
                         isReadonly,
                     }: {
    chatId: string;
    isReadonly: boolean;
}) {
    const shortId =
        !chatId ? 'new' : chatId.length > 8 ? `${chatId.slice(0, 4)}…${chatId.slice(-3)}` : chatId;

    return (
        <div className="hidden md:flex items-center gap-2 min-w-0">
            <AnimatePresence initial={false} mode="popLayout">
                {isReadonly ? (
                    <motion.div
                        key="readonly"
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-400/30"
                        initial={{y: -6, opacity: 0}}
                        animate={{y: 0, opacity: 1}}
                        exit={{y: -6, opacity: 0}}
                    >
                        <Lock className="h-3.5 w-3.5" aria-hidden="true"/>
                        Read-only
                    </motion.div>
                ) : (
                    <motion.div
                        key="editable"
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/30"
                        initial={{y: -6, opacity: 0}}
                        animate={{y: 0, opacity: 1}}
                        exit={{y: -6, opacity: 0}}
                    >
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true"/>
                        Editable
                    </motion.div>
                )}
            </AnimatePresence>

            <Separator/>

            <motion.div
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-300 dark:border-zinc-700 min-w-0"
                initial={{y: -6, opacity: 0}}
                animate={{y: 0, opacity: 1}}
                transition={{delay: 0.05}}
            >
                <ClipboardList className="h-3.5 w-3.5 shrink-0" aria-hidden="true"/>
                <span className="truncate">Case: {shortId}</span>
            </motion.div>
        </div>
    );
}

function PureChatHeader({
                            chatId,
                            selectedModelId,
                            selectedVisibilityType,
                            isReadonly,
                            session,
                        }: Props) {
    const router = useRouter();

    const onNewCase = () => {
        router.push('/');
        router.refresh();
    };

    return (
        <motion.header
            className="sticky top-0 z-40 w-full border-b border-zinc-200/60 dark:border-zinc-800/80 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            initial={{y: -16, opacity: 0}}
            animate={{y: 0, opacity: 1}}
            transition={{type: 'spring', stiffness: 260, damping: 26}}
            role="banner"
            aria-label="MedBrevia case header"
        >
            {/* Decorative top accent bar */}
            <div
                className="h-0.5 bg-gradient-to-r from-primary/60 via-sky-500/50 to-primary/60 dark:from-primary/40 dark:via-sky-400/40 dark:to-primary/40"/>

            <div className="mx-auto max-w-[1400px] px-2 md:px-4">
                {/* Row: [SidebarToggle] [Case/Brand (md+)] .......... [Visibility][Model][New Case] */}
                <div className="flex flex-wrap items-center gap-2 md:gap-3 py-2">
                    {/* FAR-LEFT: Sidebar toggle — always visible */}
                    <div className="shrink-0">
                        <SidebarToggle/>
                    </div>

                    {/* Left-side context (md+): case badges and brand chip */}
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                        <CaseContext chatId={chatId} isReadonly={isReadonly}/>

                        {/* Brand chip (md+), de-emphasized */}
                        <motion.div
                            className="hidden md:flex items-center gap-2 rounded-xl border border-zinc-200/60 dark:border-zinc-800/70 bg-white/60 dark:bg-zinc-900/50 backdrop-blur px-2.5 py-1.5 min-w-0"
                            initial={{scale: 0.98, opacity: 0}}
                            animate={{scale: 1, opacity: 1}}
                            transition={{type: 'spring', stiffness: 300, damping: 22}}
                        >
              <span
                  className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary p-1 shrink-0">
                <Stethoscope className="h-3.5 w-3.5" aria-hidden="true"/>
              </span>
                            <span className="text-xs md:text-sm font-medium truncate max-w-[220px]">
                MedBrevia · Clinical Workspace
              </span>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        className="ml-1 inline-flex items-center text-zinc-500 hover:text-foreground transition-colors"
                                        aria-label="About this workspace"
                                    >
                                        <CircleHelp className="h-3.5 w-3.5"/>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                    Optimized for clinical reasoning, drafting notes, orders, and payer-ready docs.
                                </TooltipContent>
                            </Tooltip>
                        </motion.div>
                    </div>

                    {/* Spacer pushes controls to far-right */}
                    <div className="flex-1"/>

                    {/* RIGHT: visibility → model → New Case (rightmost) */}
                    <div className="ml-auto flex items-center gap-2 md:gap-3">
                        <motion.div
                            className="px-0 py-0"
                            initial={{y: -6, opacity: 0}}
                            animate={{y: 0, opacity: 1}}
                            transition={{delay: 0.04, type: 'spring', stiffness: 280, damping: 22}}
                        >
                            <VisibilitySelector
                                chatId={chatId}
                                selectedVisibilityType={selectedVisibilityType}
                                className="order-1"
                            />
                        </motion.div>

                        {!isReadonly && (
                            <motion.div
                                className="rounded-xl bg-white/60 dark:bg-zinc-900/50 backdrop-blur px-1.5 py-1"
                                initial={{y: -6, opacity: 0}}
                                animate={{y: 0, opacity: 1}}
                                transition={{delay: 0.06, type: 'spring', stiffness: 280, damping: 22}}
                            >
                                <ModelSelector session={session} selectedModelId={selectedModelId} className="order-2"/>
                            </motion.div>
                        )}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <motion.div
                                    initial={{scale: 0.98, opacity: 0}}
                                    animate={{scale: 1, opacity: 1}}
                                    transition={{type: 'spring', stiffness: 300, damping: 22, delay: 0.08}}
                                >
                                    <Button
                                        variant="default"
                                        className="relative overflow-hidden group h-9 md:h-[34px] px-2 sm:px-3 rounded-xl"
                                        onClick={onNewCase}
                                        aria-label="Start a new case"
                                    >
                                        <span
                                            className="pointer-events-none absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 before:absolute before:inset-0 before:bg-gradient-to-r before:from-transparent before:via-white/30 before:to-transparent before:translate-x-[-120%] group-hover:before:translate-x-[120%] before:transition-transform before:duration-700 before:[mask-image:linear-gradient(to_right,transparent,black,transparent)]"/>
                                        <FilePlus2 className="h-4 w-4 mr-0 sm:mr-1.5" aria-hidden="true"/>
                                        <span className="hidden sm:inline font-medium">New Case</span>
                                    </Button>
                                </motion.div>
                            </TooltipTrigger>
                            <TooltipContent>Start a new MedBrevia case</TooltipContent>
                        </Tooltip>
                    </div>
                </div>
            </div>
        </motion.header>
    );
}

export const ChatHeader = memo(PureChatHeader, (prev, next) => {
    if (prev.selectedModelId !== next.selectedModelId) return false;
    if (prev.selectedVisibilityType !== next.selectedVisibilityType) return false;
    if (prev.isReadonly !== next.isReadonly) return false;
    if (prev.chatId !== next.chatId) return false;
    return true;
});