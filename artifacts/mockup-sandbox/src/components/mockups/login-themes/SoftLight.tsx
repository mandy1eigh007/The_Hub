const FEATURES = [
  { icon: "🤖", text: "Claude Sonnet + GPT-4o side by side" },
  { icon: "🗄️", text: "Auto-sync to Google Drive / Obsidian" },
  { icon: "🔒", text: "API keys encrypted, session persists" },
  { icon: "⚡", text: "Stop streaming · Alt+1/2/3 · ⌘K new chat" },
];

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function SoftLight() {
  const t = {
    bg: "#f1eee7",
    card: "#ffffff",
    border: "#e1ddd3",
    logo: "linear-gradient(135deg,#7c6af7,#a78bfa)",
    glow: "0 0 24px rgba(124,106,247,.30)",
    title: "#23232b",
    sub: "#56565f",
    pill: "#f4f2ec",
    pillText: "#33333b",
    foot: "#8a8a92",
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: t.bg,
        fontFamily: "'Syne', system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: t.card,
          border: `1px solid ${t.border}`,
          borderRadius: 14,
          padding: 34,
          width: 390,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
          boxShadow: "0 18px 50px rgba(40,38,52,.14)",
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            background: t.logo,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 23,
            boxShadow: t.glow,
            color: "#fff",
          }}
        >
          ⬡
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.5px", color: t.title }}>
          The Hub
        </div>
        <div style={{ fontSize: 13, color: t.sub, lineHeight: 1.65 }}>
          Claude + ChatGPT in one window.
          <br />
          Every conversation saved to your Obsidian vault.
        </div>
        <ul style={{ listStyle: "none", width: "100%", display: "flex", flexDirection: "column", gap: 6, padding: 0, margin: 0 }}>
          {FEATURES.map((f) => (
            <li
              key={f.text}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 11px",
                background: t.pill,
                borderRadius: 6,
                fontSize: 12,
                color: t.pillText,
                textAlign: "left",
                border: "1px solid #ebe8e0",
              }}
            >
              <span>{f.icon}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            padding: "12px 20px",
            borderRadius: 10,
            background: "#7c6af7",
            color: "#fff",
            border: "none",
            fontFamily: "'Syne', sans-serif",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
          }}
        >
          <GoogleIcon />
          Sign in with Google
        </button>
        <p style={{ fontSize: 11, color: t.foot, margin: 0 }}>
          Only accesses Google Drive. Never reads your email.
        </p>
      </div>
    </div>
  );
}
