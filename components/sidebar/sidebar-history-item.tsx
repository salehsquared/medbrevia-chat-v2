// components/sidebar/sidebar-history-item.tsx
'use client';

import {useEffect, useMemo, useState, memo} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import Link from 'next/link';

import type {Chat} from '@/lib/db/schema';
import {
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
} from '../ui/sidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
    CheckCircleFillIcon,
    GlobeIcon,
    LockIcon,
    MoreHorizontalIcon,
    ShareIcon,
    TrashIcon,
    LoaderIcon,
} from '../common/icons';
import {useChatVisibility} from '@/hooks/use-chat-visibility';

const NAV_TIMEOUT_MS = 8000; // hard stop so spinners never linger

const PureChatItem = ({
                          chat,
                          isActive,
                          onDelete,
                          setOpenMobile,
                      }: {
    chat: Chat;
    isActive: boolean;
    onDelete: (chatId: string) => void;
    setOpenMobile: (open: boolean) => void;
}) => {
    const router = useRouter();
    const pathname = usePathname();
    const [navigating, setNavigating] = useState(false);

    const href = useMemo(() => `/chat/${chat.id}`, [chat.id]);

    const {visibilityType, setVisibilityType} = useChatVisibility({
        chatId: chat.id,
        initialVisibilityType: chat.visibility,
    });

    // Stop the inline spinner when this item becomes active or on route change.
    useEffect(() => {
        if (isActive) setNavigating(false);
    }, [isActive]);

    useEffect(() => {
        // Any route change should clear the local navigating state for safety.
        setNavigating(false);
    }, [pathname]);

    // Ensure we never show a spinner longer than NAV_TIMEOUT_MS.
    useEffect(() => {
        if (!navigating) return;
        const id = window.setTimeout(() => setNavigating(false), NAV_TIMEOUT_MS);
        return () => window.clearTimeout(id);
    }, [navigating]);

    return (
        <SidebarMenuItem>
            <SidebarMenuButton
                asChild
                isActive={isActive}
                className="relative"
                aria-busy={navigating}
                aria-live="polite"
            >
                <Link
                    href={href}
                    onMouseEnter={() => router.prefetch(href)}
                    onClick={(e) => {
                        // Allow new tab/window behaviors
                        if (e.metaKey || e.ctrlKey || e.button === 1) return;
                        e.preventDefault();
                        setNavigating(true);
                        setOpenMobile(false);
                        router.push(href);
                    }}
                >
                    {/* Make contents a flex row so spinner never overlaps the 3-dots menu */}
                    <span className="flex items-center gap-2 min-w-0 pr-2">
            <span className="truncate">{chat.title}</span>

                        {/* Inline spinner that does NOT intercept pointer events */}
                        {navigating && (
                            <span
                                aria-hidden="true"
                                className="inline-flex h-4 w-4 shrink-0 animate-spin pointer-events-none text-muted-foreground"
                            >
                <LoaderIcon/>
              </span>
                        )}
          </span>
                    <span className="sr-only">
            {navigating ? 'Loading case…' : undefined}
          </span>
                </Link>
            </SidebarMenuButton>

            <DropdownMenu modal>
                <DropdownMenuTrigger asChild>
                    <SidebarMenuAction
                        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mr-0.5"
                        showOnHover={!isActive}
                        // Ensure the action button remains clickable even when the item shows a spinner
                    >
                        <MoreHorizontalIcon/>
                        <span className="sr-only">More</span>
                    </SidebarMenuAction>
                </DropdownMenuTrigger>

                <DropdownMenuContent side="bottom" align="end">
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer">
                            <ShareIcon/>
                            <span>Share</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuPortal>
                            <DropdownMenuSubContent>
                                <DropdownMenuItem
                                    className="cursor-pointer flex-row justify-between"
                                    onClick={() => {
                                        setVisibilityType('private');
                                    }}
                                >
                                    <div className="flex flex-row gap-2 items-center">
                                        <LockIcon size={12}/>
                                        <span>Private</span>
                                    </div>
                                    {visibilityType === 'private' ? (
                                        <CheckCircleFillIcon/>
                                    ) : null}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    className="cursor-pointer flex-row justify-between"
                                    onClick={() => {
                                        setVisibilityType('public');
                                    }}
                                >
                                    <div className="flex flex-row gap-2 items-center">
                                        <GlobeIcon/>
                                        <span>Public</span>
                                    </div>
                                    {visibilityType === 'public' ? <CheckCircleFillIcon/> : null}
                                </DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuPortal>
                    </DropdownMenuSub>

                    <DropdownMenuItem
                        className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive dark:text-red-500"
                        onSelect={() => onDelete(chat.id)}
                    >
                        <TrashIcon/>
                        <span>Delete</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </SidebarMenuItem>
    );
};

export const ChatItem = memo(PureChatItem, (prevProps, nextProps) => {
    if (prevProps.isActive !== nextProps.isActive) return false;
    return true;
});