// components/sidebar/app-sidebar.tsx
'use client';

import {useEffect, useState} from 'react';
import type {User} from 'next-auth';
import {usePathname, useRouter} from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import {PlusIcon, LoaderIcon} from '@/components/common/icons';
import {SidebarHistory} from '@/components/sidebar/sidebar-history';
import {SidebarUserNav} from '@/components/sidebar/sidebar-user-nav';
import {Button} from '@/components/ui/button';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    useSidebar,
} from '@/components/ui/sidebar';
import {Tooltip, TooltipContent, TooltipTrigger} from '../ui/tooltip';

const NAV_TIMEOUT_MS = 8000;

export function AppSidebar({user}: { user: User | undefined }) {
    const router = useRouter();
    const pathname = usePathname();
    const {setOpenMobile} = useSidebar();
    const [creating, setCreating] = useState(false);

    // Clear the "creating" spinner when the route changes or on timeout.
    useEffect(() => {
        setCreating(false);
    }, [pathname]);

    useEffect(() => {
        if (!creating) return;
        const id = window.setTimeout(() => setCreating(false), NAV_TIMEOUT_MS);
        return () => window.clearTimeout(id);
    }, [creating]);

    return (
        <Sidebar className="group-data-[side=left]:border-r-0">
            <SidebarHeader>
                <SidebarMenu>
                    <div className="flex flex-row justify-between items-center">
                        <Link
                            href="/"
                            onClick={() => {
                                setOpenMobile(false);
                            }}
                            className="flex flex-row gap-3 items-center"
                        >
                            <Image
                                src="/assets/logo.png"
                                alt="MedBrevia"
                                width={20}
                                height={20}
                                className="rounded-sm"
                                priority
                            />
                            <span className="text-lg font-semibold px-2 hover:bg-muted rounded-md cursor-pointer">
                MedBrevia Chat
              </span>
                        </Link>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    type="button"
                                    className="p-2 h-fit relative"
                                    onClick={() => {
                                        if (creating) return;
                                        setCreating(true);
                                        setOpenMobile(false);
                                        router.push('/');
                                        router.refresh();
                                    }}
                                    aria-label="New MedBrevia case"
                                >
                                    {/* Icon fades while spinner overlays inside the button bounds */}
                                    <span className={creating ? 'opacity-0' : 'opacity-100'}>
                    <PlusIcon/>
                  </span>
                                    {creating && (
                                        <span
                                            aria-hidden="true"
                                            className="absolute inset-0 grid place-items-center pointer-events-none"
                                        >
                      <span className="animate-spin">
                        <LoaderIcon/>
                      </span>
                    </span>
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent align="end">New Case</TooltipContent>
                        </Tooltip>
                    </div>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarHistory user={user}/>
            </SidebarContent>

            <SidebarFooter>{user && <SidebarUserNav user={user}/>}</SidebarFooter>
        </Sidebar>
    );
}