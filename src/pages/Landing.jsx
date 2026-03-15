import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function Landing() {
  const { user } = useAuth()

  return (
    <div className="landing">
      <div className="landing-content">
        <h1 className="landing-title">Splittify</h1>
        <p className="landing-tagline">
          Split expenses with friends. No more awkward "who owes what" conversations.
        </p>
        <div className="landing-actions">
          {user ? (
            <Link to="/dashboard" className="btn btn-primary">
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
