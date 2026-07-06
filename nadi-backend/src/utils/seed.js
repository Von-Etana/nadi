const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const allowedRoles = ['admin', 'super_admin'];
const targetEmail = process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL;
const targetPassword = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
const targetFirstName = process.env.ADMIN_FIRST_NAME || process.env.SEED_ADMIN_FIRST_NAME || 'Admin';
const targetLastName = process.env.ADMIN_LAST_NAME || process.env.SEED_ADMIN_LAST_NAME || 'User';
const targetPhone = process.env.ADMIN_PHONE || process.env.SEED_ADMIN_PHONE;
const targetRole = process.env.ADMIN_ROLE || process.env.SEED_ADMIN_ROLE || 'super_admin';

if (!targetEmail || !targetPassword) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD to create or promote an admin account.');
  process.exit(1);
}

if (!allowedRoles.includes(targetRole)) {
  console.error(`ADMIN_ROLE must be one of: ${allowedRoles.join(', ')}`);
  process.exit(1);
}

async function findAuthUserByEmail(email) {
  const pageSize = 1000;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;

    const user = data?.users?.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      return user;
    }

    if (!data?.users || data.users.length < pageSize) {
      break;
    }
  }

  return null;
}

async function main() {
  console.log(`Preparing ${targetRole} account for ${targetEmail}...`);

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email, role, first_name, last_name, phone')
    .eq('email', targetEmail)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  let authUser = await findAuthUserByEmail(targetEmail);

  if (!authUser) {
    if (!targetPhone && !profile?.phone) {
      throw new Error('Provide ADMIN_PHONE when creating a new admin account.');
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      phone: targetPhone || profile.phone,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: {
        firstName: targetFirstName,
        lastName: targetLastName,
        phone: targetPhone || profile.phone,
      },
    });

    if (error || !data?.user) {
      throw error || new Error('Failed to create auth user');
    }

    authUser = data.user;
    console.log(`Created auth user ${authUser.id}`);
  } else {
    console.log(`Found existing auth user ${authUser.id}`);

    const { error } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: targetPassword,
      user_metadata: {
        firstName: targetFirstName,
        lastName: targetLastName,
        phone: targetPhone || profile?.phone,
      },
      email_confirm: true,
      phone_confirm: true,
    });

    if (error) {
      throw error;
    }
  }

  const { error: roleError } = await supabase
    .from('users')
    .update({
      first_name: targetFirstName,
      last_name: targetLastName,
      phone: targetPhone || profile?.phone,
      role: targetRole,
      is_email_verified: true,
      is_phone_verified: true,
      is_active: true,
    })
    .eq('id', authUser.id);

  if (roleError) {
    throw roleError;
  }

  console.log(`Admin account ready: ${targetEmail} (${targetRole})`);
  console.log('You can now sign in at /admin/login using the same credentials.');
}

main().catch((error) => {
  console.error('Seed failed:', error.message || error);
  process.exit(1);
});
