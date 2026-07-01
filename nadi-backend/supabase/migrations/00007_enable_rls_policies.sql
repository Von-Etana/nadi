-- Production access hardening: direct browser access is read-only and owner-scoped.
-- Money movement and writes remain behind backend service-role routes and SECURITY DEFINER RPCs.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logistics_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.giftcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_giftcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can read own wallet"
ON public.wallets
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own logistics orders"
ON public.logistics_orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own fuel orders"
ON public.fuel_orders
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own gift card activity"
ON public.user_giftcards
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can read own notification preferences"
ON public.notification_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
