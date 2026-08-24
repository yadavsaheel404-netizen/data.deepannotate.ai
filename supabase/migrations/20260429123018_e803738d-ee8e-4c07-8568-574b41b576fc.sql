REVOKE ALL ON FUNCTION public.handle_profile_completion_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_profile_completion_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_profile_completion_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_profile_completion_after_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_profile_completion_points(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalculate_points_balances(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_points_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_points_balance(uuid) TO authenticated;