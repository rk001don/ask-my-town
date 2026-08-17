import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { updateProduct, uploadCatalogImage } from "@/lib/admin.functions";
import { toUserMessage } from "@/lib/errors";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type ProductLite = { id: string; name: string; image_url: string | null };

type Match = {
  file: File;
  product: ProductLite | null;
  status: "matched" | "unmatched" | "uploading" | "done" | "failed";
  error?: string;
};

/**
 * Reduces a product name or a filename to a comparable key.
 *
 * Catalogue names carry a unit in brackets ("Idli (2 pcs)") that nobody is
 * going to reproduce in a filename, so the bracketed part is dropped before
 * comparing -- `idli.jpg` should match "Idli (2 pcs)".
 */
function matchKey(input: string): string {
  return input
    .replace(/\.[a-z0-9]+$/i, "") // extension
    .replace(/\([^)]*\)/g, "") // "(2 pcs)", "(500 ml)"
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Drag-a-folder bulk photo upload.
 *
 * Photography is the single largest remaining gap in how the catalogue looks,
 * and uploading ~200 images one at a time through the per-product picker was
 * never going to happen. This matches files to products by filename, shows
 * every match for confirmation before anything is written, then uploads.
 */
export function BulkImageUpload({
  products,
  onDone,
}: {
  products: ProductLite[];
  onDone: () => void;
}) {
  const upload = useServerFn(uploadCatalogImage);
  const patch = useServerFn(updateProduct);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);

  const byKey = useMemo(() => {
    const m = new Map<string, ProductLite>();
    for (const p of products) {
      const k = matchKey(p.name);
      // First writer wins: if two products reduce to the same key we'd rather
      // leave the second unmatched than silently attach a photo to the wrong
      // one.
      if (k && !m.has(k)) m.set(k, p);
    }
    return m;
  }, [products]);

  const missingCount = products.filter((p) => !p.image_url).length;

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    if (!files.length) return;
    const next: Match[] = files
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => {
        if (file.size > MAX_IMAGE_BYTES) {
          return { file, product: null, status: "failed" as const, error: "Over 5MB" };
        }
        const product = byKey.get(matchKey(file.name)) ?? null;
        return { file, product, status: product ? ("matched" as const) : ("unmatched" as const) };
      });
    setMatches(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadAll() {
    setBusy(true);
    const pending = matches.filter((m) => m.status === "matched" && m.product);
    let ok = 0;
    for (const m of pending) {
      setMatches((prev) =>
        prev.map((x) => (x.file === m.file ? { ...x, status: "uploading" } : x)),
      );
      try {
        const buffer = await m.file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const { url } = await upload({
          data: {
            fileName: m.file.name,
            contentType: m.file.type,
            dataBase64: btoa(binary),
          },
        });
        await patch({ data: { id: m.product!.id, image_url: url } });
        ok += 1;
        setMatches((prev) => prev.map((x) => (x.file === m.file ? { ...x, status: "done" } : x)));
      } catch (err) {
        setMatches((prev) =>
          prev.map((x) =>
            x.file === m.file
              ? { ...x, status: "failed", error: toUserMessage(err, "Upload failed") }
              : x,
          ),
        );
      }
    }
    setBusy(false);
    toast.success(`${ok} photo${ok === 1 ? "" : "s"} uploaded`);
    onDone();
  }

  const matchedCount = matches.filter((m) => m.status === "matched").length;
  const unmatched = matches.filter((m) => m.status === "unmatched");

  return (
    <div className="card-surface space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Bulk photo upload</h3>
          <p className="mt-0.5 text-xs text-[color:var(--text-secondary)]">
            Name each file after the product — <code>idli.jpg</code>, <code>masala-dosa.jpg</code> —
            then pick them all at once. Brackets like “(2 pcs)” are ignored when matching.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[color:var(--warning)]/15 px-2.5 py-1 text-[11px] font-bold text-[color:var(--warning)]">
          {missingCount} missing
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="tap-scale flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--border-strong)] px-4 py-4 text-sm font-semibold disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4" />
        Choose photos
      </button>

      {matches.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[color:var(--text-secondary)]">
              {matchedCount} matched · {unmatched.length} unmatched
            </span>
            <button
              type="button"
              onClick={() => setMatches([])}
              className="tap-scale text-[color:var(--text-muted)] hover:text-[color:var(--danger)]"
            >
              Clear
            </button>
          </div>

          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {matches.map((m) => (
              <li
                key={m.file.name}
                className="flex items-center justify-between gap-2 rounded-lg bg-[color:var(--bg-elevated-2)] px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{m.file.name}</span>
                <span className="min-w-0 flex-1 truncate text-right">
                  {m.product ? (
                    m.product.name
                  ) : (
                    <span className="text-[color:var(--text-muted)]">no match</span>
                  )}
                </span>
                <span className="w-5 shrink-0 text-right">
                  {m.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {m.status === "done" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[color:var(--success)]" />
                  )}
                  {m.status === "failed" && (
                    <X className="h-3.5 w-3.5 text-[color:var(--danger)]" />
                  )}
                </span>
              </li>
            ))}
          </ul>

          {unmatched.length > 0 && (
            <p className="text-[11px] text-[color:var(--text-muted)]">
              Unmatched files are skipped. Rename them to match the product name and pick again.
            </p>
          )}

          <button
            type="button"
            onClick={uploadAll}
            disabled={busy || matchedCount === 0}
            className="tap-scale accent-gradient flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Upload {matchedCount} photo{matchedCount === 1 ? "" : "s"}
          </button>
        </>
      )}
    </div>
  );
}
