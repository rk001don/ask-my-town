import { useRef, useState } from "react";
import { Loader2, ImageOff, Pencil } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { uploadCatalogImage } from "@/lib/admin.functions";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Small thumbnail with a pencil overlay — click to replace. Uploads through an
 * admin-only server function (the storage bucket is private) and hands back a
 * stable image URL; the caller is responsible for saving that URL onto the
 * product/category row.
 */
export function CatalogImageUpload({
  imageUrl,
  onUploaded,
  size = "h-14 w-14",
}: {
  imageUrl?: string | null;
  onUploaded: (url: string) => void;
  size?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const upload = useServerFn(uploadCatalogImage);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files can be used here");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image is too large — please use one under 5MB");
      return;
    }
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      const { url } = await upload({
        data: { fileName: file.name, contentType: file.type, dataBase64: btoa(binary) },
      });
      onUploaded(url);
      toast.success("Image updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }


  return (
    <button
      type="button"
      onClick={() => fileRef.current?.click()}
      disabled={uploading}
      className={`tap-scale group relative grid ${size} shrink-0 place-items-center overflow-hidden rounded-xl bg-white/5`}
      aria-label="Change image"
    >
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageOff className="h-5 w-5 text-[color:var(--text-muted)]" strokeWidth={1.5} />
      )}
      <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin text-white" />
        ) : (
          <Pencil className="h-4 w-4 text-white" />
        )}
      </span>
    </button>
  );
}
