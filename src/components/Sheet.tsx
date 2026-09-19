import { useEffect, type ReactNode } from "react";

/* The bottom sheet every editor opens in. Closes on the backdrop, on Escape,
   and holds the page still underneath. */

export function Sheet({
  wide, onClose, children,
}: {
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="sheetWrap"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={wide ? "sheet wide" : "sheet"} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
