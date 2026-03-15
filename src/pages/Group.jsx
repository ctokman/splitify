import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function formatCents(cents) {
  return (cents / 100).toFixed(2)
}

export function Group() {
  const { id } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDesc, setExpenseDesc] = useState('')
  const [splitAmong, setSplitAmong] = useState(new Set())
  const [addingExpense, setAddingExpense] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !id) return
    loadGroup()
  }, [user, id])

  async function loadGroup() {
    const { data: g } = await supabase.from('groups').select('*').eq('id', id).single()
    if (!g) {
      setLoading(false)
      return
    }
    setGroup(g)

    const { data: mems } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', id)
    const userIds = (mems || []).map((m) => m.user_id)

    // Members: we have user_ids; for display we use "You" / "Member" until profiles exist
    // For now, we'll fetch member emails via a different approach.
    // Supabase doesn't expose auth.users to client. We need a profiles table or
    // store email in group_members. Let me add a profiles table that we populate
    // on signup, or we could store user_id and fetch from a view.
    // Simpler: create a view or RPC that returns members with email.
    // Actually the simplest is: we have group_members with user_id. We can't get
    // other users' emails from the client. So we need either:
    // 1. A profiles table (id, email) with trigger on auth.users
    // 2. Store email in group_members when adding
    // 3. Use a Supabase Edge Function
    // For MVP, let's add a profiles table with a trigger to sync from auth.users.
    // Actually Supabase has a standard pattern: create profiles(id, email, ...) and
    // use a trigger on auth.users to insert on signup.
    // Let me add that to the schema and use it. For now I'll just use user_id and
    // we can show "Member" or fetch from a profiles table.
    // I'll add profiles table to schema.
    const { data: memberList } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', id)

    // Get emails - we need profiles. Let me check if we can use a different approach.
    // We could have each expense and split store the paid_by/user_id and we look up
    // from a map. The issue is displaying "Alice" vs "Bob". For MVP, let's use
    // user_id and show truncated id, or add profiles.
    // I'll add a profiles table to the schema.
    setMembers(memberList || [])

    const { data: exps } = await supabase
      .from('expenses')
      .select('*, expense_splits(*)')
      .eq('group_id', id)
      .order('created_at', { ascending: false })
    setExpenses(exps || [])

    // Calculate balances
    const balanceMap = {}
    userIds.forEach((uid) => (balanceMap[uid] = 0))

    for (const exp of exps || []) {
      balanceMap[exp.paid_by] = (balanceMap[exp.paid_by] || 0) + exp.amount_cents
      for (const split of exp.expense_splits || []) {
        balanceMap[split.user_id] = (balanceMap[split.user_id] || 0) - split.amount_cents
      }
    }

    const balanceList = Object.entries(balanceMap)
      .map(([uid, bal]) => ({ user_id: uid, balance_cents: bal }))
      .filter((b) => b.balance_cents !== 0)
    setBalances(balanceList)

    setLoading(false)
  }

  async function inviteUser(e) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setError('')
    setInviting(true)
    try {
      const { error: err } = await supabase.from('invites').insert({
        group_id: id,
        email: inviteEmail.trim().toLowerCase(),
        invited_by: user.id,
      })
      if (err) throw err
      setInviteEmail('')
      loadGroup()
    } catch (err) {
      setError(err.message || 'Failed to send invite')
    } finally {
      setInviting(false)
    }
  }

  function toggleSplit(userId) {
    setSplitAmong((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function addExpense(e) {
    e.preventDefault()
    const amountCents = Math.round(parseFloat(expenseAmount) * 100)
    if (!amountCents || amountCents <= 0 || splitAmong.size === 0) return
    setError('')
    setAddingExpense(true)
    try {
      const { data: exp, error: expErr } = await supabase
        .from('expenses')
        .insert({
          group_id: id,
          amount_cents: amountCents,
          paid_by: user.id,
          description: expenseDesc.trim(),
        })
        .select('id')
        .single()
      if (expErr) throw expErr

      const shareCents = Math.floor(amountCents / splitAmong.size)
      const remainder = amountCents - shareCents * splitAmong.size
      const splits = Array.from(splitAmong).map((uid, i) => ({
        expense_id: exp.id,
        user_id: uid,
        amount_cents: shareCents + (i === 0 ? remainder : 0),
      }))
      const { error: splitErr } = await supabase.from('expense_splits').insert(splits)
      if (splitErr) throw splitErr

      setExpenseAmount('')
      setExpenseDesc('')
      setSplitAmong(new Set())
      setShowAddExpense(false)
      loadGroup()
    } catch (err) {
      setError(err.message || 'Failed to add expense')
    } finally {
      setAddingExpense(false)
    }
  }

  if (loading) return <div className="loading-screen"><p>Loading...</p></div>
  if (!group) return <div className="error-message">Group not found</div>

  const memberIds = members.map((m) => m.user_id)

  return (
    <div className="group-page">
      <header className="group-header">
        <Link to="/dashboard" className="back-link">← Dashboard</Link>
        <h1>{group.name}</h1>
      </header>

      <section className="balances-section">
        <h2>Balances</h2>
        {balances.length === 0 ? (
          <p className="empty-state">No expenses yet. Add one below.</p>
        ) : (
          <ul className="balance-list">
            {balances.map((b) => {
              const isOwed = b.balance_cents > 0
              const label = b.user_id === user.id ? 'You' : 'Member'
              return (
                <li key={b.user_id} className={isOwed ? 'owed' : 'owes'}>
                  {label} {isOwed ? 'are owed' : 'owes'} ${formatCents(Math.abs(b.balance_cents))}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="expenses-section">
        <h2>Expenses</h2>
        {!showAddExpense ? (
          <button onClick={() => setShowAddExpense(true)} className="btn btn-primary">
            Add expense
          </button>
        ) : (
          <form onSubmit={addExpense} className="add-expense-form">
            <label>
              Amount ($)
              <input
                type="number"
                step="0.01"
                min="0"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                required
              />
            </label>
            <label>
              Description
              <input
                type="text"
                placeholder="Dinner, Uber, etc."
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
              />
            </label>
            <div className="split-select">
              <span>Split among:</span>
              {memberIds.map((uid) => (
                <label key={uid} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={splitAmong.has(uid)}
                    onChange={() => toggleSplit(uid)}
                  />
                  {uid === user.id ? 'You' : 'Member'}
                </label>
              ))}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setShowAddExpense(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={addingExpense}>
                {addingExpense ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>
        )}
        {error && <div className="error-message">{error}</div>}
        <ul className="expense-list">
          {expenses.map((exp) => (
            <li key={exp.id} className="expense-item">
              <span className="exp-amount">${formatCents(exp.amount_cents)}</span>
              <span className="exp-desc">{exp.description || 'Expense'}</span>
              <span className="exp-paid">
                {exp.paid_by === user.id ? 'You' : 'Member'} paid
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="invite-section">
        <h2>Invite by email</h2>
        <form onSubmit={inviteUser}>
          <input
            type="email"
            placeholder="friend@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            disabled={inviting}
          />
          <button type="submit" className="btn btn-secondary" disabled={inviting}>
            {inviting ? 'Sending...' : 'Invite'}
          </button>
        </form>
      </section>
    </div>
  )
}
