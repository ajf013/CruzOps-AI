import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClerkProvider } from '@clerk/clerk-react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  createRoot(document.getElementById('root')).render(
    <div style={{ padding: '2rem', color: 'white', fontFamily: 'Inter, sans-serif', textAlign: 'center', marginTop: '20vh' }}>
      <h1 style={{ marginBottom: '1rem' }}>🔐 Authentication Setup Required</h1>
      <p style={{ color: '#94a3b8' }}>To enable cross-device syncing with Google/Apple/Microsoft logins, you must configure your Identity Provider.</p>
      <div style={{ textAlign: 'left', display: 'inline-block', marginTop: '2rem', background: '#1e293b', padding: '2rem', borderRadius: '1rem', border: '1px solid #334155' }}>
        <ol style={{ lineHeight: '1.8' }}>
          <li>Go to <a href="https://clerk.com" style={{color: '#3b82f6'}} target="_blank">clerk.com</a> and create a free application.</li>
          <li>Copy your "Publishable Key".</li>
          <li>Open your <code>.env</code> file and add:<br/><br/>
            <code style={{ background: '#0f172a', padding: '0.5rem', borderRadius: '0.25rem', color: '#4ade80' }}>
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
            </code>
          </li>
          <br/>
          <li>Restart your local server (<code>npm run dev</code>).</li>
        </ol>
      </div>
    </div>
  )
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
        <App />
      </ClerkProvider>
    </StrictMode>,
  )
}
