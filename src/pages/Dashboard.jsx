import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const [groups, setGroups] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGroupName, setNewGroupName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError('')
    loadGroups()
    loadInvites()
  }, [user])

  async function loadGroups() {
    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', user.id)

      if (membershipsError) {
        setError(membershipsError.message || 'Failed to load groups')
        setGroups([])
        return
      }

      if (!memberships?.length) {
        setGroups([])
        return
      }

      const groupIds = memberships.map((m) => m.group_id)
      const { data: groupData, error: groupsError } = await supabase
        .from('groups')
        .select('*')
        .in('id', groupIds)
        .order('created_at', { ascending: false })

      if (groupsError) {
        setError(groupsError.message || 'Failed to load groups')
        setGroups([])
        return
      }

      setGroups(groupData || [])
    } catch (err) {
      setError(err.message || 'Failed to load groups')
      setGroups([])
    } finally {
      setLoading(false)
    }
  }

  async function loadInvites() {
    try {
      const { data, error: invitesError } = await supabase
        .from('invites')
        .select('*, groups(name)')
        .eq('email', user.email)
        .eq('status', 'pending')
      if (!invitesError) setInvites(data || [])
    } catch {
      // Invites are non-critical, ignore
    }
  }

  async function acceptInvite(inviteId, groupId) {
    try {
      await supabase.from('group_members').insert({ group_id: groupId, user_id: user.id })
      await supabase.from('invites').update({ status: 'accepted' }).eq('id', inviteId)
      loadGroups()
      loadInvites()
    } catch (err) {
      setError(err.message || 'Failed to accept invite')
    }
  }

  async function declineInvite(inviteId) {
    await supabase.from('invites').update({ status: 'declined' }).eq('id', inviteId)
    loadInvites()
  }

  async function createGroup(e) {
    e.preventDefault()
    if (!newGroupName.trim()) {
      setError('Enter a group name')
      return
    }
    setError('')
    setCreating(true)
    const groupName = newGroupName.trim()
    setNewGroupName('')
    try {
      const { data: newGroup, error: err } = await supabase
        .from('groups')
        .insert({ name: groupName, created_by: user.id })
        .select('id, name, created_at')
        .single()
      if (err) throw err
      setGroups((prev) => [newGroup, ...prev])
    } catch (err) {
      setNewGroupName(groupName)
      setError(err.message || 'Failed to create group')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Splittify</h1>
          <p className="user-email">{user?.email}</p>
        </div>
        <div className="header-actions">
          <button onClick={() => { setLoading(true); setError(''); loadGroups(); loadInvites(); }} className="btn btn-ghost">
            Refresh
          </button>
          <button onClick={signOut} className="btn btn-ghost">
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        {invites.length > 0 && (
          <section className="invites-section">
            <h2>Pending invites</h2>
            <ul className="invite-list">
              {invites.map((inv) => (
                <li key={inv.id} className="invite-item">
                  <span>{inv.groups?.name} invited you</span>
                  <div className="invite-actions">
                    <button onClick={() => acceptInvite(inv.id, inv.group_id)} className="btn btn-primary btn-sm">
                      Accept
                    </button>
                    <button onClick={() => declineInvite(inv.id)} className="btn btn-ghost btn-sm">
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="create-group">
          <h2>Create a group</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={createGroup}>
            <input
              type="text"
              placeholder="Group name (e.g. Paris Trip 2025)"
              value={newGroupName}
              onChange={(e) => { setNewGroupName(e.target.value); setError(''); }}
              disabled={creating}
              autoComplete="off"
              required
              minLength={1}
            />
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </section>

        <section className="groups-section">
          <h2>Your groups</h2>
          {loading ? (
            <p>Loading...</p>
          ) : groups.length === 0 ? (
            <div className="empty-state">
              <p>No groups yet. Create one above to get started.</p>
              <p className="empty-hint">
                Using seed data? Log in as <strong>alice@test.splittify.dev</strong> (password: testpass123) to see Paris Trip and NYC Weekend.
              </p>
            </div>
          ) : (
            <ul className="group-list">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link to={`/group/${group.id}`} className="group-card">
                    <span className="group-name">{group.name}</span>
                    <span className="group-arrow">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
