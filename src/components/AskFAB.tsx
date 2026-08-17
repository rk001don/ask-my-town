import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Paperclip, Loader2 } from "lucide-react";
import { addFreeformAsk } from "@/lib/cart-store";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { toUserMessage } from "@/lib/errors";

let openSheet: ((prefill?: string) => void) | null = null;

/** Open the Ask MyTown sheet from anywhere (e.g. no-results states). */
export function openAskSheet(prefill?: string) {
  openSheet?.(prefill);
}

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB

export function AskFAB({ hideMobileTrigger = false }: { hideMobileTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    openSheet = (prefill?: string) => {
      if (prefill) setText(prefill);
      setOpen(true);
    };
    return () => {
      openSheet = null;
    };
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const hide =
    loc.pathname.startsWith("/staff") ||
    loc.pathname.startsWith("/admin") ||
    loc.pathname.startsWith("/order/") ||
    loc.pathname === "/checkout" ||
    loc.pathname === "/cart";
  // NOTE: `hide` intentionally only ever suppresses the two trigger buttons
  // below, never the sheet itself -- openAskSheet() can be called from a
  // page in this hidden list (e.g. cart's own "empty cart, ask MyTown"
  // button), and if `open` becomes true it must still actually render.

  function resetAttachment() {
    setAttachmentPath(null);
    setAttachmentPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only photos can be attached");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Photo is too large — please use one under 5MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      // Lazy: AskFAB is on every page but this runs only when someone
      // actually attaches a photo, so the client shouldn't be in the bundle
      // everyone downloads.
      const { supabase } = await import("@/integrations/supabase/client");
      const { error } = await supabase.storage
        .from("ask-attachments")
        .upload(path, file, { upsert: false });
      if (error) throw error;
      setAttachmentPath(path);
      setAttachmentPreview(URL.createObjectURL(file));
    } catch (err) {
      toast.error(toUserMessage(err, "Couldn't attach that photo"));
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const trimmed = text.trim();
    if (trimmed.length < 3) {
      toast.error("Tell us a bit more");
      return;
    }
    addFreeformAsk(trimmed, undefined, attachmentPath ?? undefined);
    setText("");
    resetAttachment();
    setOpen(false);
    toast.success("Added to your ask");
    navigate({ to: "/cart" });
  }

  return (
    <>
      {/* Mobile: this FAB and the cart bar both want the same bottom-right
          corner. Rather than stacking them (which reads as clutter and is
          easy to mis-offset), the cart bar simply wins that corner when it's
          showing -- "Ask MyTown" stays reachable from the home page card and
          header, so nothing is lost. */}
      {!open && !hide && !hideMobileTrigger && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask MyTown"
          className="fixed z-[var(--z-nav)] tap-scale accent-gradient shadow-[var(--shadow-glow)] grid h-14 w-14 place-items-center rounded-full md:hidden"
          style={{
            // Matches the bottom nav's actual right edge exactly: the nav is
            // w-[min(92vw,480px)] centered via left-1/2 -translate-x-1/2, so its
            // right edge sits at max(4vw, 50vw-240px) from the viewport's right
            // edge -- a plain "right: 1rem" only happened to look close on some
            // widths and drifted on others, which is what read as "misaligned."
            right: "max(4vw, calc(50vw - 240px))",
            bottom: "calc(5.5rem + env(safe-area-inset-bottom))",
          }}
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}
      {/* Desktop (md+): bottom nav is hidden (sidebar replaces it), so the FAB
          becomes a normal corner FAB again. True viewport-fixed (no transform
          hack on an ancestor -- that previously turned "fixed" into "absolute
          relative to the full scrollable column," which is why this button
          used to sink to wherever the page content happened to end instead of
          staying pinned to the visible corner). The right offset is computed
          the same way the content column's own centering works -- sidebar
          (14rem) + max-w-4xl (56rem) = 70rem -- so the button still hugs the
          column's visual edge on wide screens instead of floating in the
          empty gutter at the raw viewport edge. */}
      {!open && !hide && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Ask MyTown"
          className="fixed z-[var(--z-nav)] tap-scale accent-gradient shadow-[var(--shadow-glow)] hidden items-center gap-2 rounded-full px-5 py-3 font-semibold md:flex"
          style={{ right: "max(1.5rem, calc((100vw - 70rem) / 2 + 1.5rem))", bottom: "1.5rem" }}
        >
          <Sparkles className="h-4 w-4" />
          Ask MyTown
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/60 backdrop-blur-sm"
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
                onClick={() => {
                  setOpen(false);
                  resetAttachment();
                }}
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
            <div className="mt-1 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
              <span>{text.length}/280</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPickFile}
              />
              {attachmentPreview ? (
                <span className="flex items-center gap-2">
                  <img
                    src={attachmentPreview}
                    alt="Attached photo"
                    className="h-8 w-8 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={resetAttachment}
                    className="tap-scale grid h-8 w-8 place-items-center rounded-full hover:bg-white/5"
                    aria-label="Remove photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="tap-scale flex items-center gap-1 rounded-full border border-[color:var(--border-strong)] px-2.5 py-1 font-semibold"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Paperclip className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Uploading…" : "Attach photo (optional)"}
                </button>
              )}
            </div>
            <button
              onClick={submit}
              disabled={text.trim().length < 3 || uploading}
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
