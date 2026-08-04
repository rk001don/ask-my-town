ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_requested_date_range;

ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_staff_id_fkey;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;