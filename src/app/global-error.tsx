"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-IN">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24, background: "#f6f5f1", color: "#16181d" }}>
        <h1>MIRA is temporarily unavailable</h1>
        <p>Please try again in a moment.</p>
        <button type="button" onClick={() => reset()} style={{ minHeight: 44, padding: "0 16px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
