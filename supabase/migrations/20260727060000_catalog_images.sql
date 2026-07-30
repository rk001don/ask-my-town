-- Categories didn't have an image field at all (only icon_key, a Lucide
-- icon name, not a real photo). Products already had image_url but nothing
-- ever wrote to it, and there was no upload path.
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Public bucket (unlike the private ask-attachments one) -- product and
-- category photos are meant to be freely visible to any customer browsing
-- the storefront, so a plain public URL is the right model here, not a
-- signed URL per view.
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-images', 'catalog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view (bucket is public, but an explicit SELECT policy is still
-- required since RLS is on by default for storage.objects).
DROP POLICY IF EXISTS "catalog-images: public read" ON storage.objects;
CREATE POLICY "catalog-images: public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'catalog-images');

-- Only admin can upload/replace/remove catalog images -- this is a
-- merchandising decision, not something any staff role should touch.
DROP POLICY IF EXISTS "catalog-images: admin can write" ON storage.objects;
CREATE POLICY "catalog-images: admin can write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "catalog-images: admin can update" ON storage.objects;
CREATE POLICY "catalog-images: admin can update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "catalog-images: admin can delete" ON storage.objects;
CREATE POLICY "catalog-images: admin can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-images' AND public.has_role(auth.uid(), 'admin'));
