import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '2rem',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <div className="animate-fade-in" style={{ textAlign: 'center', maxWidth: '480px' }}>
        {/* Logo glow */}
        <div
          style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 2rem',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #00ffc8, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            animation: 'glow-pulse 3s ease-in-out infinite',
          }}
        >
          ◈
        </div>

        <h1
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            background: 'linear-gradient(135deg, #00ffc8, #7c3aed)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.75rem',
          }}
        >
          Project Tracker
        </h1>

        <p
          style={{
            color: 'var(--color-text-secondary)',
            fontSize: '1.1rem',
            lineHeight: 1.6,
            marginBottom: '2.5rem',
          }}
        >
          Your personal project memory system.
          <br />
          Track ideas, tasks, and progress.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link href="/projects" className="btn-primary" style={{ padding: '0.75rem 2rem' }}>
            Open Dashboard
          </Link>
        </div>

        <p
          style={{
            marginTop: '3rem',
            color: 'var(--color-text-muted)',
            fontSize: '0.8rem',
          }}
        >
          Self-hosted • Single-user • Secure
        </p>
      </div>
    </main>
  );
}
