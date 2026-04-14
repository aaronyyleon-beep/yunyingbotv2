import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { LoginPage } from "./components/LoginPage";
import { AccountPage } from "./components/AccountPage";
import "./styles.css";

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  tenantId: string | null;
  discordId: string | null;
  discordUsername: string | null;
  discordAvatar: string | null;
}

interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

function AppShell() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("auth_token")
  );
  const [checking, setChecking] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [guilds, setGuilds] = useState<DiscordGuild[]>(() => {
    const stored = localStorage.getItem("discord_guilds");
    return stored ? JSON.parse(stored) : [];
  });
  const [view, setView] = useState<"account" | "app">("account");

  // Handle Discord OAuth callback on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");

    if (!code || !state) return;

    // Clear URL immediately
    window.history.replaceState({}, "", window.location.pathname);

    fetch("/auth/discord/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, state }),
    })
      .then((res) => res.json())
      .then((data: { token?: string; user?: AuthUser; guilds?: DiscordGuild[]; error?: string }) => {
        if (data.token && data.user) {
          localStorage.setItem("auth_token", data.token);
          if (data.guilds) localStorage.setItem("discord_guilds", JSON.stringify(data.guilds));
          setToken(data.token);
          setUser(data.user);
          setGuilds(data.guilds ?? []);
        } else {
          setOauthError(data.error ?? "登录失败");
        }
      })
      .catch(() => setOauthError("网络错误，请重试"));
  }, []);

  // Validate existing token
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }

    let cancelled = false;
    fetch("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("discord_guilds");
          setToken(null);
          setUser(null);
        }
        return res.json();
      })
      .then((data: { user?: AuthUser } | undefined) => {
        if (cancelled) return;
        if (data?.user) setUser(data.user);
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("discord_guilds");
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleLogout = () => {
    if (token) {
      fetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("auth_token");
    localStorage.removeItem("discord_guilds");
    setToken(null);
    setUser(null);
    setGuilds([]);
    setView("account");
  };

  if (checking) return null;

  if (!token) {
    return (
      <LoginPage
        oauthError={oauthError}
        onLoginSuccess={(t) => {
          localStorage.setItem("auth_token", t);
          setToken(t);
        }}
      />
    );
  }

  if (view === "app") {
    return <App onNavigateAccount={() => setView("account")} />;
  }

  return (
    <AccountPage
      user={user}
      guilds={guilds}
      onNavigateApp={() => setView("app")}
      onLogout={handleLogout}
    />
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);
