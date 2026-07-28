import { createContext, useContext, useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const SheetContext = createContext<{ open: boolean; onOpenChange: (v: boolean) => void }>({
  open: false,
  onOpenChange: () => {},
});

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return <SheetContext.Provider value={{ open, onOpenChange }}>{children}</SheetContext.Provider>;
}

function SheetContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange } = useContext(SheetContext);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className={cn("fixed inset-y-0 left-0 z-50 w-72 border-r bg-card p-6 shadow-lg", className)} {...props}>
        {children}
      </div>
    </div>
  );
}

export { Sheet, SheetContent };
