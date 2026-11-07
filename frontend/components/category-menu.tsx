"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, Network } from "lucide-react";
import { api } from "@/lib/api";
import type { CategoryOption } from "@/lib/types";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuLinkItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
} from "./ui/dropdown-menu";

export function CategoryMenu({ defaultKind = "exams", onNavigate }: { defaultKind?: "exams" | "labs"; onNavigate: () => void }) {
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [error, setError] = useState(false);
  const [kind, setKind] = useState(defaultKind);
  const [open, setOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api<CategoryOption[]>("/categories/public", { signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) { setCategories(items); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [open, retry]);
  const href = (category: string, subcategory = "") => `/${kind}?${new URLSearchParams({ category, ...(subcategory ? { subcategory } : {}) })}`;
  function navigate() { setOpen(false); onNavigate(); }
  return <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
    <DropdownMenuTrigger openOnHover delay={120} className="inline-flex w-fit items-center gap-1.5 rounded-md outline-none hover:text-violet-600 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-4 data-popup-open:text-violet-700">
      Categories <ChevronDown size={14} aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent className="portal-theme" aria-label="Browse categories" sideOffset={16}>
      <DropdownMenuRadioGroup aria-label="Content type" value={kind} onValueChange={value => setKind(value as "exams" | "labs")} className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
        <DropdownMenuRadioItem value="exams"><BookOpen aria-hidden="true" />Exams</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="labs"><Network aria-hidden="true" />Labs</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup key={kind}>
        <DropdownMenuLabel>Browse by category</DropdownMenuLabel>
        {error && <><p role="status" className="px-3 py-2 text-xs text-rose-700">Could not refresh categories.</p><DropdownMenuItem closeOnClick={false} onClick={() => setRetry(value => value + 1)}>Retry loading</DropdownMenuItem></>}
        {!categories && !error && <DropdownMenuItem disabled>Loading categories…</DropdownMenuItem>}
        {categories?.length === 0 && <DropdownMenuItem disabled>No categories available yet</DropdownMenuItem>}
        {categories?.map(category => category.subcategories.length ? <DropdownMenuSub key={category.name}>
          <DropdownMenuSubTrigger className="min-w-0"><span className="truncate">{category.name}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="portal-theme" aria-label={`${category.name} subcategories`}>
            <DropdownMenuGroup>
              {category.subcategories.map(child => <DropdownMenuLinkItem key={child.name} render={<Link href={href(category.name, child.name)} />} onClick={navigate} className="break-words">{child.name}</DropdownMenuLinkItem>)}
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub> : <DropdownMenuLinkItem key={category.name} render={<Link href={href(category.name)} />} onClick={navigate} className="break-words">{category.name}</DropdownMenuLinkItem>)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLinkItem render={<Link href={`/${kind}`} />} onClick={navigate}>Browse all {kind}</DropdownMenuLinkItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
