-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    avatar TEXT,
    date_of_birth DATE,
    address JSONB DEFAULT '{"street": "", "city": "", "state": "", "country": "Nigeria", "zipCode": ""}'::jsonb,
    kyc_status TEXT CHECK (kyc_status IN ('pending', 'in_review', 'verified', 'rejected')) DEFAULT 'pending',
    kyc_documents JSONB DEFAULT '[]'::jsonb,
    bvn_number TEXT,
    bvn_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    is_email_verified BOOLEAN DEFAULT false,
    is_phone_verified BOOLEAN DEFAULT false,
    account_type TEXT CHECK (account_type IN ('individual', 'business')) DEFAULT 'individual',
    role TEXT CHECK (role IN ('user', 'admin', 'super_admin')) DEFAULT 'user',
    two_factor_auth JSONB DEFAULT '{"enabled": false}'::jsonb,
    transaction_pin TEXT,
    login_attempts INT DEFAULT 0,
    lock_until TIMESTAMPTZ,
    referral_code TEXT UNIQUE,
    referred_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    referrals JSONB DEFAULT '[]'::jsonb,
    preferences JSONB DEFAULT '{"currency": "NGN", "language": "en", "notifications": {"email": true, "sms": true, "push": true, "marketing": false}}'::jsonb,
    last_login JSONB,
    devices JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);

-- 2. WALLETS TABLE
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    naira_balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (naira_balance >= 0.00),
    naira_ledger_balance NUMERIC(15, 2) DEFAULT 0.00,
    crypto_balances JSONB DEFAULT '[]'::jsonb,
    bank_accounts JSONB DEFAULT '[]'::jsonb,
    cards JSONB DEFAULT '[]'::jsonb,
    virtual_account JSONB,
    limits JSONB DEFAULT '{"dailyTransfer": 500000, "dailyWithdrawal": 1000000, "singleTransfer": 200000, "kycTier": "tier1"}'::jsonb,
    daily_usage JSONB DEFAULT '{"date": null, "transfers": 0, "withdrawals": 0, "deposits": 0}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_frozen BOOLEAN DEFAULT false,
    freeze_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON public.wallets(user_id);

-- 3. TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount >= 0.00),
    currency TEXT DEFAULT 'NGN',
    fees JSONB DEFAULT '{"processing": 0, "platform": 0, "network": 0, "total": 0}'::jsonb,
    net_amount NUMERIC(15, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')) DEFAULT 'pending',
    direction TEXT CHECK (direction IN ('credit', 'debit')),
    counterparty JSONB,
    payment_method TEXT,
    provider JSONB,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    utility_details JSONB,
    giftcard_details JSONB,
    crypto_details JSONB,
    logistics_details JSONB,
    fuel_details JSONB,
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,
    refund_info JSONB,
    ip_address TEXT,
    device_info JSONB,
    admin_notes TEXT,
    approval JSONB DEFAULT '{"required": false}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON public.transactions(reference);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- 4. LOGISTICS ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.logistics_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    pickup JSONB NOT NULL,
    delivery JSONB NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    package JSONB NOT NULL,
    pricing JSONB NOT NULL,
    insurance JSONB DEFAULT '{"optedIn": false}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    tracking JSONB,
    assigned_to UUID, -- Optional driver id
    delivery_proof JSONB,
    cancellation JSONB,
    rating JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_user_id ON public.logistics_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_logistics_order_number ON public.logistics_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_logistics_status ON public.logistics_orders(status);

-- 5. FUEL ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.fuel_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('fuel', 'gas')),
    fuel_details JSONB,
    gas_details JSONB,
    delivery_address JSONB NOT NULL,
    contact_phone TEXT NOT NULL,
    pricing JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT DEFAULT 'normal',
    assigned_driver UUID,
    driver JSONB,
    tracking JSONB,
    delivery_proof JSONB,
    customer_notes TEXT,
    admin_notes TEXT,
    scheduled_date TIMESTAMPTZ,
    cancellation JSONB,
    rating JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fuel_user_id ON public.fuel_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_fuel_order_number ON public.fuel_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_fuel_status ON public.fuel_orders(status);

-- 6. GIFTCARDS TABLE
CREATE TABLE IF NOT EXISTS public.giftcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    denominations JSONB DEFAULT '[]'::jsonb,
    rates JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    stock INT DEFAULT 0,
    region TEXT DEFAULT 'global',
    terms_and_conditions TEXT,
    expiry_period INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER GIFTCARDS TABLE (Purchases and Sales)
CREATE TABLE IF NOT EXISTS public.user_giftcards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    card_type TEXT NOT NULL,
    card_value NUMERIC(15, 2) NOT NULL,
    card_currency TEXT DEFAULT 'USD',
    card_code TEXT, -- Encrypted
    card_pin TEXT,  -- Encrypted
    card_image TEXT,
    rate NUMERIC(15, 2) NOT NULL,
    payout_amount NUMERIC(15, 2) NOT NULL,
    payout_currency TEXT DEFAULT 'NGN',
    status TEXT NOT NULL DEFAULT 'pending',
    review JSONB,
    delivered_card JSONB,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_giftcards_user_id ON public.user_giftcards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_giftcards_status ON public.user_giftcards(status);

-- 7. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_to JSONB,
    action JSONB,
    channels JSONB DEFAULT '{"inApp": true, "email": false, "sms": false, "push": false}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    priority TEXT DEFAULT 'normal',
    expires_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_is_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- NOTIFICATION PREFERENCES TABLE
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    preferences JSONB DEFAULT '{"transaction": {"inApp": true, "email": true, "sms": true, "push": true}, "order": {"inApp": true, "email": true, "sms": false, "push": true}, "security": {"inApp": true, "email": true, "sms": true, "push": true}, "promotional": {"inApp": true, "email": false, "sms": false, "push": false}, "crypto": {"inApp": true, "email": false, "sms": false, "push": true}}'::jsonb,
    quiet_hours JSONB DEFAULT '{"enabled": false, "start": "22:00", "end": "07:00"}'::jsonb,
    price_alerts JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. TRIGGERS FOR AUTH SYNCHRONIZATION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, first_name, last_name, phone, referral_code)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'firstName', ''),
        COALESCE(new.raw_user_meta_data->>'lastName', ''),
        COALESCE(new.raw_user_meta_data->>'phone', ''),
        'NADI' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8))
    );

    -- Auto create a wallet for the user
    INSERT INTO public.wallets (user_id)
    VALUES (new.id);

    -- Auto create notification preferences
    INSERT INTO public.notification_preferences (user_id)
    VALUES (new.id);

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
