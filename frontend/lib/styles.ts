export const focusClass =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen";

export const buttonClass = `rounded-md bg-pen px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink ${focusClass} disabled:opacity-50`;

/** A button for something other than the main thing to do. */
export const quietButtonClass = `rounded-md border border-rule bg-paper px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-muted ${focusClass} disabled:opacity-50`;

/** A button that is only its words, for something off to the side. */
export const plainButtonClass = `rounded-md px-2 py-2 text-sm font-medium text-muted hover:text-ink ${focusClass} disabled:opacity-50`;

/** A button that destroys something. */
export const dangerButtonClass = `rounded-md border border-danger bg-paper px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-white ${focusClass} disabled:opacity-50`;

export const linkClass = `rounded-sm font-medium text-pen underline-offset-4 hover:underline ${focusClass}`;

export const inputClass =
  "w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus-visible:border-pen focus-visible:outline-2 focus-visible:outline-pen/30";

/** A panel that stands off the page, such as a form or a list. */
export const cardClass = "rounded-xl border border-rule bg-paper shadow-sm";

/** Something the user should know before going on. */
export const noticeClass =
  "rounded-md border border-notice-rule bg-notice px-4 py-3 text-sm text-notice-ink";

/** Something that went wrong, said where it happened. */
export const errorClass = "text-sm text-danger";
