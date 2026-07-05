/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./app.js", "./supabase-client.js"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        muted: "hsl(var(--muted-color))",
        border: "hsl(var(--border-color))",
        primary: "hsl(var(--primary))"
      },
      boxShadow: {
        card: "0 12px 30px rgba(34, 24, 18, 0.08)",
        lift: "0 18px 42px rgba(34, 24, 18, 0.14)"
      }
    }
  },
  plugins: []
};
