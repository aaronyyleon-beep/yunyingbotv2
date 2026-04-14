import "./AccountPage.css";

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

interface AccountPageProps {
  user: AuthUser | null;
  guilds: DiscordGuild[];
  onNavigateApp: () => void;
  onLogout: () => void;
}

function getAvatarUrl(user: AuthUser): string {
  if (user.discordId && user.discordAvatar) {
    return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png?size=128`;
  }
  // Default Discord avatar
  const index = user.discordId ? (Number(BigInt(user.discordId) >> 22n) % 6) : 0;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function getGuildIconUrl(guild: DiscordGuild): string | null {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
}

export function AccountPage({ user, guilds, onNavigateApp, onLogout }: AccountPageProps) {
  // Fetch client ID for bot invite links
  const clientIdRef = { current: "" };
  if (typeof window !== "undefined") {
    // Try to get from a meta tag or fetch it
    const stored = sessionStorage.getItem("discord_client_id");
    if (stored) {
      clientIdRef.current = stored;
    } else {
      fetch("/auth/discord")
        .then((r) => r.json())
        .then((data: { url?: string }) => {
          if (data.url) {
            const u = new URL(data.url);
            const cid = u.searchParams.get("client_id");
            if (cid) {
              sessionStorage.setItem("discord_client_id", cid);
              clientIdRef.current = cid;
            }
          }
        })
        .catch(() => {});
    }
  }

  const handleInviteBot = (guildId: string) => {
    const cid = sessionStorage.getItem("discord_client_id") ?? clientIdRef.current;
    if (!cid) {
      alert("无法获取 Bot Client ID，请刷新页面重试");
      return;
    }
    window.open(
      `https://discord.com/oauth2/authorize?client_id=${cid}&permissions=66560&scope=bot&guild_id=${guildId}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  return (
    <div className="account-page">
      {/* Header */}
      <header className="account-header">
        <div className="account-header-inner">
          <div className="account-header-brand">
            <img className="account-header-logo" src="/go2mars-favicon.jpg" alt="Logo" />
            <span className="account-header-name">YunyingBot</span>
          </div>
          <div className="account-header-actions">
            <button className="account-btn-app" type="button" onClick={onNavigateApp}>
              进入分析平台
            </button>
            <button className="account-btn-logout" type="button" onClick={onLogout}>
              登出
            </button>
          </div>
        </div>
      </header>

      <main className="account-main">
        {/* User Profile Card */}
        {user && (
          <section className="account-profile-card">
            <img className="account-avatar" src={getAvatarUrl(user)} alt="Avatar" />
            <div className="account-profile-info">
              <h2 className="account-display-name">
                {user.displayName ?? user.discordUsername ?? "用户"}
              </h2>
              {user.discordUsername && (
                <p className="account-discord-tag">@{user.discordUsername}</p>
              )}
              <p className="account-email">{user.email}</p>
            </div>
          </section>
        )}

        {/* Guilds Section */}
        <section className="account-guilds-section">
          <div className="account-section-header">
            <h3>Discord 服务器</h3>
            <span className="account-guild-count">{guilds.length} 个服务器</span>
          </div>

          {guilds.length === 0 ? (
            <div className="account-empty">
              <p>未获取到 Discord 服务器列表</p>
              <p className="account-empty-hint">请重新登录以授权读取服务器信息</p>
            </div>
          ) : (
            <div className="account-guild-list">
              {guilds.map((guild) => (
                <div key={guild.id} className="account-guild-item">
                  <div className="account-guild-info">
                    {getGuildIconUrl(guild) ? (
                      <img className="account-guild-icon" src={getGuildIconUrl(guild)!} alt="" />
                    ) : (
                      <div className="account-guild-icon account-guild-icon--placeholder">
                        {guild.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="account-guild-meta">
                      <span className="account-guild-name">{guild.name}</span>
                      {guild.owner && <span className="account-guild-owner-badge">Owner</span>}
                    </div>
                  </div>
                  <button
                    className="account-btn-invite"
                    type="button"
                    onClick={() => handleInviteBot(guild.id)}
                  >
                    邀请 Bot
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
