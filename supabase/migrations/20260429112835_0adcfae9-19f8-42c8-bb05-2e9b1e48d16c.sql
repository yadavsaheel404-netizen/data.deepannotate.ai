-- Lock search_path on the helper functions that didn't already set it
ALTER FUNCTION public.is_profile_complete(public.profiles) SET search_path = public;

-- Revoke public/anon execute on the new SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.points_txn_before_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.points_txn_after_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_profile_completion_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_profile_completion_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_profile_completion_after_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_setting_int(text, int) FROM PUBLIC, anon;