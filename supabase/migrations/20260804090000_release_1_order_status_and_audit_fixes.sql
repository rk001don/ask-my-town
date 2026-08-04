-- Release 1: unblock order updates and repair audit logging identity
-- Keep the requested-date validation at INSERT time through the RLS policy,
-- while allowing UPDATEs to succeed for historical orders.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_requested_date_range;

-- audit_log was created against public.staff(id), but the app writes auth.users.id.
-- Repoint the FK so audit inserts are not silently rejected.
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_staff_id_fkey;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES auth.users(id) ON DELETE SET NULL;
