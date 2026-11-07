"use client";

import Link from "next/link";
import { Archive, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLinkItem, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export const cardPublishButton = "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-not-allowed disabled:opacity-50";
export const cardOpenButton = "inline-flex w-full items-center justify-center rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900";

export function CardActions({ title, updateHref, disabled, onDelete, onRetire }: {
  title: string;
  updateHref: string;
  disabled: boolean;
  onDelete: () => void;
  onRetire?: () => void;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger disabled={disabled} aria-label={`Actions for ${title}`} className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50">
      <Ellipsis size={20} aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48">
      <DropdownMenuLinkItem render={<Link href={updateHref} />}><Pencil aria-hidden="true" />Update</DropdownMenuLinkItem>
      {onRetire && <DropdownMenuItem disabled={disabled} onClick={onRetire} className="cursor-pointer"><Archive aria-hidden="true" />Retire</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={disabled} onClick={onDelete} className="cursor-pointer text-rose-700 data-highlighted:bg-rose-50 data-highlighted:text-rose-800"><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
