import type { ReactNode } from "react";

// Decorative stroke icons; the control that holds one supplies the accessible name.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

export const PencilIcon = () => <Icon><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>;
export const TrashIcon = () => <Icon><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></Icon>;
export const CopyIcon = () => <Icon><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></Icon>;
export const CheckIcon = () => <Icon><path d="M20 6 9 17l-5-5" /></Icon>;
export const ChatIcon = () => <Icon><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12Z" /></Icon>;
export const MailIcon = () => <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>;

/** Square 44px icon control class (WCAG 2.5.8 target size). */
export const iconButtonClass =
  "inline-flex size-11 items-center justify-center rounded-lg border-2 border-line bg-surface text-fg hover:bg-accent";
