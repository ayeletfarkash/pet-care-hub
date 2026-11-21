"use client";

import { useState } from "react";
import { fmt, type Dict } from "@/i18n";
import { announce } from "../live-region";
import { CheckIcon, ChatIcon, CopyIcon, MailIcon, iconButtonClass } from "../ui/icons";

/** Copy / WhatsApp / email actions for one invitation link. `context` names the row for screen readers. */
export function InviteShare({ t, link, petName, context }: { t: Dict; link: string; petName: string; context?: string }) {
  const [copied, setCopied] = useState(false);
  const i = t.invites;
  const text = fmt(i.shareText, { pet: petName, link });
  const name = (label: string) => (context ? `${label}: ${context}` : label);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      announce(i.copied);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      announce(i.copyFailed);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copy} aria-label={name(i.copy)} title={i.copy} className={iconButtonClass}>
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
        aria-label={name(i.shareWhatsApp)} title={i.shareWhatsApp} className={iconButtonClass}>
        <ChatIcon />
      </a>
      <a href={`mailto:?subject=${encodeURIComponent(fmt(i.emailSubject, { pet: petName }))}&body=${encodeURIComponent(text)}`}
        aria-label={name(i.shareEmail)} title={i.shareEmail} className={iconButtonClass}>
        <MailIcon />
      </a>
    </div>
  );
}
