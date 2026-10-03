"use client";

// Adapted from shadcn/ui's Base UI dropdown-menu (MIT).
// https://ui.shadcn.com/docs/components/base/dropdown-menu
import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const itemClass = "relative flex min-h-10 cursor-default items-center gap-2 rounded-md px-3 py-2 text-sm outline-none select-none data-highlighted:bg-slate-100 data-highlighted:text-slate-950 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

export function DropdownMenu(props: MenuPrimitive.Root.Props) { return <MenuPrimitive.Root {...props} />; }
export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) { return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />; }
export function DropdownMenuContent({ align = "start", alignOffset = 0, side = "bottom", sideOffset = 6, className, ...props }: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return <MenuPrimitive.Portal>
    <MenuPrimitive.Positioner className="isolate z-[80] outline-none" align={align} alignOffset={alignOffset} side={side} sideOffset={sideOffset} collisionPadding={12}>
      <MenuPrimitive.Popup data-slot="dropdown-menu-content" className={cn("max-h-[var(--available-height)] w-64 max-w-[calc(100vw-24px)] origin-[var(--transform-origin)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-lg outline-none transition-[opacity,transform] duration-150 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0 motion-reduce:transition-none", className)} {...props} />
    </MenuPrimitive.Positioner>
  </MenuPrimitive.Portal>;
}
export function DropdownMenuGroup(props: MenuPrimitive.Group.Props) { return <MenuPrimitive.Group {...props} />; }
export function DropdownMenuLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) { return <MenuPrimitive.GroupLabel className={cn("px-3 py-2 text-xs font-medium text-slate-500", className)} {...props} />; }
export function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) { return <MenuPrimitive.Item className={cn(itemClass, className)} {...props} />; }
export function DropdownMenuLinkItem({ className, ...props }: MenuPrimitive.LinkItem.Props) { return <MenuPrimitive.LinkItem closeOnClick className={cn(itemClass, "cursor-pointer", className)} {...props} />; }
export function DropdownMenuSub(props: MenuPrimitive.SubmenuRoot.Props) { return <MenuPrimitive.SubmenuRoot {...props} />; }
export function DropdownMenuSubTrigger({ className, children, ...props }: MenuPrimitive.SubmenuTrigger.Props) {
  return <MenuPrimitive.SubmenuTrigger className={cn(itemClass, "data-popup-open:bg-slate-100 data-popup-open:text-slate-950", className)} {...props}>{children}<ChevronRight aria-hidden="true" className="ml-auto text-slate-400" /></MenuPrimitive.SubmenuTrigger>;
}
export function DropdownMenuSubContent(props: React.ComponentProps<typeof DropdownMenuContent>) { return <DropdownMenuContent side="right" align="start" alignOffset={-6} sideOffset={6} {...props} />; }
export function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) { return <MenuPrimitive.Separator className={cn("my-1.5 h-px bg-slate-100", className)} {...props} />; }
export function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) { return <MenuPrimitive.RadioGroup {...props} />; }
export function DropdownMenuRadioItem({ className, ...props }: MenuPrimitive.RadioItem.Props) { return <MenuPrimitive.RadioItem closeOnClick={false} className={cn(itemClass, "justify-center font-medium data-checked:bg-white data-checked:text-slate-950 data-checked:shadow-sm", className)} {...props} />; }
