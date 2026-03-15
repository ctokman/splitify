/**
 * Seed script: creates 4 test users and populates the database with
 * realistic trip data (Paris Trip + NYC Weekend) for testing balances,
 * UI, and permissions.
 *
 * Run: npm run seed (loads .env automatically)
 * Or: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/seed.js
 *
 * Get the service_role key from Supabase → Project Settings → API
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing env vars. Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
    'Get service_role from Supabase → Project Settings → API (keep it secret!)'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const TEST_USERS = [
  { email: 'alice@test.splittify.dev', password: 'testpass123', name: 'Alice' },
  { email: 'bob@test.splittify.dev', password: 'testpass123', name: 'Bob' },
  { email: 'carol@test.splittify.dev', password: 'testpass123', name: 'Carol' },
  { email: 'dave@test.splittify.dev', password: 'testpass123', name: 'Dave' },
]

async function createUser({ email, password }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    const existing = await supabase.auth.admin.listUsers()
    const u = existing.data?.users?.find((u) => u.email === email)
    if (u) return u.id
    throw error
  }
  return data.user.id
}

async function seed() {
  console.log('Seeding Splittify...\n')

  // Verify schema exists (table missing = 42P01 or PGRST301)
  const { error: schemaCheck } = await supabase.from('groups').select('id').limit(1)
  if (schemaCheck && (schemaCheck.code === '42P01' || schemaCheck.code === 'PGRST301' || schemaCheck.message?.includes('does not exist'))) {
    console.error(
      'The groups table does not exist. Run supabase/schema.sql in Supabase SQL Editor first.\n' +
      'Supabase Dashboard → SQL Editor → New query → paste schema.sql → Run'
    )
    process.exit(1)
  }

  const userIds = {}
  for (const u of TEST_USERS) {
    try {
      userIds[u.name] = await createUser(u)
      console.log(`  Created user: ${u.email}`)
    } catch (err) {
      console.error(`  Failed to create ${u.email}:`, err.message)
      throw err
    }
  }

  const alice = userIds.Alice
  const bob = userIds.Bob
  const carol = userIds.Carol
  const dave = userIds.Dave

  // Group 1: Paris Trip 2025 (all 4)
  console.log('\n  Creating Paris Trip 2025...')
  const { data: parisGroup, error: eg1 } = await supabase
    .from('groups')
    .insert({ name: 'Paris Trip 2025', created_by: alice })
    .select('id')
    .single()
  if (eg1) {
    console.error('  Failed to create Paris group:', eg1.message, eg1.details)
    throw eg1
  }

  const { error: gm1 } = await supabase.from('group_members').insert([
    { group_id: parisGroup.id, user_id: bob },
    { group_id: parisGroup.id, user_id: carol },
    { group_id: parisGroup.id, user_id: dave },
  ])
  if (gm1) {
    console.error('  Failed to add Paris members:', gm1.message, gm1.details)
    throw gm1
  }
  console.log('  Created group: Paris Trip 2025 (Alice, Bob, Carol, Dave)')

  const parisMembers = [alice, bob, carol, dave]
  const parisExpenses = [
    { amount_cents: 8000, paid_by: alice, description: 'Dinner at Le Bistrot' },
    { amount_cents: 12000, paid_by: bob, description: 'Dinner at Le Comptoir' },
    { amount_cents: 60000, paid_by: carol, description: 'Hotel (2 rooms, 2 nights)' },
    { amount_cents: 4000, paid_by: dave, description: 'Uber to airport' },
    { amount_cents: 6000, paid_by: alice, description: 'Louvre tickets' },
  ]

  for (const exp of parisExpenses) {
    const { data: e, error: exErr } = await supabase
      .from('expenses')
      .insert({
        group_id: parisGroup.id,
        amount_cents: exp.amount_cents,
        paid_by: exp.paid_by,
        description: exp.description,
      })
      .select('id')
      .single()
    if (exErr) {
      console.error('  Failed to add Paris expense:', exp.description, exErr.message)
      throw exErr
    }

    const share = Math.floor(exp.amount_cents / 4)
    const remainder = exp.amount_cents - share * 4
    const splits = parisMembers.map((uid, i) => ({
      expense_id: e.id,
      user_id: uid,
      amount_cents: share + (i === 0 ? remainder : 0),
    }))
    const { error: splitErr } = await supabase.from('expense_splits').insert(splits)
    if (splitErr) {
      console.error('  Failed to add Paris expense splits:', splitErr.message)
      throw splitErr
    }
  }
  console.log('  Added 5 expenses (dinners, hotel, Uber, Louvre)')

  // Group 2: NYC Weekend (only Alice + Bob) – tests permissions
  console.log('\n  Creating NYC Weekend...')
  const { data: nycGroup, error: eg2 } = await supabase
    .from('groups')
    .insert({ name: 'NYC Weekend', created_by: bob })
    .select('id')
    .single()
  if (eg2) {
    console.error('  Failed to create NYC group:', eg2.message, eg2.details)
    throw eg2
  }

  const { error: gm2 } = await supabase.from('group_members').insert([
    { group_id: nycGroup.id, user_id: alice },
  ])
  if (gm2) {
    console.error('  Failed to add NYC members:', gm2.message, gm2.details)
    throw gm2
  }
  console.log('  Created group: NYC Weekend (Alice, Bob only)')

  const nycMembers = [alice, bob]
  const nycExpenses = [
    { amount_cents: 4500, paid_by: alice, description: 'Brunch at Russ & Daughters' },
    { amount_cents: 12000, paid_by: bob, description: 'Broadway tickets' },
  ]

  for (const exp of nycExpenses) {
    const { data: e, error: exErr } = await supabase
      .from('expenses')
      .insert({
        group_id: nycGroup.id,
        amount_cents: exp.amount_cents,
        paid_by: exp.paid_by,
        description: exp.description,
      })
      .select('id')
      .single()
    if (exErr) {
      console.error('  Failed to add NYC expense:', exp.description, exErr.message)
      throw exErr
    }

    const share = Math.floor(exp.amount_cents / 2)
    const remainder = exp.amount_cents - share * 2
    const splits = nycMembers.map((uid, i) => ({
      expense_id: e.id,
      user_id: uid,
      amount_cents: share + (i === 0 ? remainder : 0),
    }))
    const { error: splitErr } = await supabase.from('expense_splits').insert(splits)
    if (splitErr) {
      console.error('  Failed to add NYC expense splits:', splitErr.message)
      throw splitErr
    }
  }
  console.log('  Added 2 expenses (brunch, Broadway)')

  console.log('\n✅ Seed complete!\n')
  console.log('Test accounts (password: testpass123):')
  TEST_USERS.forEach((u) => console.log(`  ${u.email}`))
  console.log('\nPermission check:')
  console.log('  - Alice & Bob: see Paris Trip + NYC Weekend')
  console.log('  - Carol & Dave: see only Paris Trip')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
