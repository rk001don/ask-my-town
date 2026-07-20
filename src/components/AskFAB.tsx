import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send } from "lucide-react";
import { addFreeformAsk } from "@/lib/cart-store";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

let openSheet: ((prefill?: string) => void) | null = null;

/** Open the Ask MyTown sheet from anywhere (e.g. no-results states). */
export function openAskSheet(prefill?: string) {
  openSheet?.(prefill);
}

export function AskFAB() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const loc = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    openSheet = (prefill?: string) => {
      if (prefill) setText(prefill);
      setOpen(true);
    };
    return () => { openSheet = null; };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  // Hide FAB on cart/checkout/employee/order confirmation
  const hide =
    loc.pathname.startsWith("/employee") ||
    loc.pathname.startsWith("/order/") ||
    loc.pathname === "/checkout";
  if (hide) return null;

  function submit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast.error("Tell us a bit more");
      return;
    }
    addFreeformAsk(trimmed);
    setText("");
    setOpen(false);
    toast.success("Added to your ask");
    navigate({ to: "/cart" });
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask MyTown"
          className="fixed z-40 tap-scale accent-gradient shadow-[var(--shadow-glow)] rounded-full flex items-center gap-2 px-5 py-3 font-semibold"
          style={{
            right: "1rem",
            bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
          }}
        >
          <Sparkles className="h-4 w-4" />
          Ask MyTown
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="sheet-in glass w-full max-w-[520px] rounded-t-3xl p-5"
            style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="text-display text-xl font-semibold">Ask MyTown</div>
                <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
                  Can't find it? Just tell us.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="tap-scale rounded-full p-2 hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 2 kg tomatoes, pickup from Mahalakshmi store"
              maxLength={280}
              rows={4}
              className="mt-4 w-full resize-none rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--bg-elevated-2)] p-3 text-[15px] leading-snug placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-primary)] focus:outline-none"
            />
            <div className="mt-1 text-right text-xs text-[color:var(--text-muted)]">
              {text.length}/280
            </div>
            <button
              onClick={submit}
              disabled={text.trim().length < 3}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full accent-gradient px-5 py-3 font-semibold tap-scale disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Add to my ask
            </button>
            <p className="mt-3 text-center text-xs text-[color:var(--text-muted)]">
              We'll confirm before doing anything. No prices till we check.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
