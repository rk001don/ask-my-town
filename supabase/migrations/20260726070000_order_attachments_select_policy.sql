-- order_attachments had an INSERT policy but no SELECT policy at all, so
-- even admin/ops staff (using the RLS-scoped client, not service_role)
-- could never read a single row -- this is the actual root cause of
-- uploaded attachment photos never appearing on the staff order dashboard.
CREATE POLICY "Order attachments: admin/ops can read" ON public.order_attachments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ops'));
