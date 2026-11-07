"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Banner } from "@/lib/banners";

const dismissedKey = "certify-dismissed-notifications";

export function NotificationDialog({ notification, onClose }: { notification: Banner; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const destination = notification.buttonUrl?.trim();

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") || []);
    if (!focusable.length) return;
    if (event.shiftKey && document.activeElement === focusable[0]) {
      event.preventDefault(); focusable[focusable.length - 1]!.focus();
    } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
      event.preventDefault(); focusable[0]!.focus();
    }
  }

  const action = destination && notification.buttonText ? destination.startsWith("/")
    ? <Link className="portal-button" href={destination} onClick={onClose}>{notification.buttonText}<ArrowRight size={17} /></Link>
    : <a className="portal-button" href={destination} target="_blank" rel="noopener noreferrer" onClick={onClose}>{notification.buttonText}<ArrowRight size={17} /></a>
    : null;

  return <div className="portal-notification-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="notification-title" className="portal-notification-dialog" onKeyDown={handleKeyDown}>
      <button ref={closeButton} type="button" className="portal-notification-close" aria-label="Close notification" onClick={onClose}><X size={21} /></button>
      {notification.desktopImage && <div className="portal-notification-image"><Image src={notification.desktopImage} alt="" fill sizes="(max-width: 680px) 100vw, 640px" unoptimized className="object-cover" /></div>}
      <div className="portal-notification-content">
        <p className="portal-eyebrow">NOTIFICATION</p>
        <h2 id="notification-title">{notification.title}</h2>
        {notification.description && <p>{notification.description}</p>}
        {action && <div className="portal-notification-action">{action}</div>}
      </div>
    </div>
  </div>;
}

export function HomeNotifications({ notifications }: { notifications: Banner[] }) {
  const [active, setActive] = useState<Banner | null>(null);

  useEffect(() => {
    if (!notifications.length) return;
    const timer = window.setTimeout(() => {
      let dismissed: string[] = [];
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(dismissedKey) || "[]");
        if (Array.isArray(stored)) dismissed = stored.filter((id): id is string => typeof id === "string");
      } catch { /* Storage may be unavailable. */ }
      setActive(notifications.find(item => !dismissed.includes(item._id)) || null);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [notifications]);

  function close() {
    if (!active) return;
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(dismissedKey) || "[]");
      const dismissed = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
      sessionStorage.setItem(dismissedKey, JSON.stringify([...new Set([...dismissed, active._id])]));
    } catch { /* The notification still closes for this view. */ }
    setActive(null);
  }

  return active ? <NotificationDialog notification={active} onClose={close} /> : null;
}
