-- The legacy PIN-based employee login (employeeLogin/updateOrderStatus server
-- functions in api.functions.ts) was removed from the app in favor of the
-- Supabase Auth staff console (/staff). Nothing in the codebase calls
-- mytown_verify_employee_pin anymore, and public.employees already had no
-- anon/authenticated grants (service_role only) -- both are now fully dead
-- and only exist to hold a seeded default PIN ('482571') at rest. Drop them.

DROP FUNCTION IF EXISTS public.mytown_verify_employee_pin(TEXT);
DROP TABLE IF EXISTS public.employees;
