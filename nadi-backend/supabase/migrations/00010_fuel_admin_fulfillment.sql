ALTER TABLE public.fuel_orders
    ALTER COLUMN assigned_driver TYPE TEXT USING assigned_driver::text;

ALTER TABLE public.logistics_orders
    ALTER COLUMN assigned_to TYPE TEXT USING assigned_to::text;

CREATE INDEX IF NOT EXISTS idx_fuel_priority ON public.fuel_orders(priority);
CREATE INDEX IF NOT EXISTS idx_fuel_scheduled_date ON public.fuel_orders(scheduled_date);
