import { useCallback, useEffect, useRef, useState } from "react";
import "./LoginPage.css";

/* ── Count-up animation hook ── */
function useCountUp(target: number, active: boolean, duration = 1200): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    let start: number | null = null;
    let rafId: number;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic
      setValue(Math.round(eased * target));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, active, duration]);
  return value;
}

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
  oauthError?: string | null;
}

export function LoginPage({ onLoginSuccess, oauthError }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ?? null);
  const [navScrolled, setNavScrolled] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const heroLeftRef = useRef<HTMLDivElement>(null);
  const featureCardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const revealRefs = useRef<HTMLElement[]>([]);
  const statsRef = useRef<HTMLDivElement>(null);
  const navScrolledRef = useRef(false);

  const statDim = useCountUp(6, statsVisible, 1000);
  const statSrc = useCountUp(5, statsVisible, 1000);

  // ── Multi-layer scroll parallax ──
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = page.scrollTop;
        const scrolled = y > 80;
        if (scrolled !== navScrolledRef.current) {
          navScrolledRef.current = scrolled;
          setNavScrolled(scrolled);
        }
        if (bgRef.current) bgRef.current.style.transform = `translate3d(0, ${y * -0.2}px, 0) scale(1.08)`;
        if (orbRef.current) orbRef.current.style.transform = `translate3d(0, ${y * -0.1}px, 0)`;
        if (heroLeftRef.current) heroLeftRef.current.style.transform = `translate3d(0, ${y * 0.06}px, 0)`;
        if (cardRef.current) cardRef.current.style.transform = `translate3d(0, ${y * -0.08}px, 0)`;
        featureCardRefs.current.forEach((el, i) => {
          if (el) {
            const rect = el.getBoundingClientRect();
            const center = rect.top + rect.height / 2;
            const viewH = window.innerHeight;
            const progress = (viewH - center) / viewH;
            const offset = progress * (20 + i * 12);
            el.style.transform = `translate3d(0, ${-offset}px, 0)`;
          }
        });
        ticking = false;
      });
    };

    page.addEventListener("scroll", onScroll, { passive: true });
    return () => page.removeEventListener("scroll", onScroll);
  }, []);

  // ── Mouse-tracking 3D tilt on login card ──
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const onMove = (e: MouseEvent) => {
      const rect = card.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rx = Math.max(-1, Math.min(1, dy)) * -4;
      const ry = Math.max(-1, Math.min(1, dx)) * 4;
      card.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(0, ${(pageRef.current?.scrollTop ?? 0) * -0.08}px, 0)`;
    };
    const onLeave = () => {
      card.style.transform = `perspective(800px) rotateX(0deg) rotateY(0deg) translate3d(0, ${(pageRef.current?.scrollTop ?? 0) * -0.08}px, 0)`;
    };

    const heroRight = card.parentElement;
    if (heroRight) {
      heroRight.addEventListener("mousemove", onMove);
      heroRight.addEventListener("mouseleave", onLeave);
      return () => {
        heroRight.removeEventListener("mousemove", onMove);
        heroRight.removeEventListener("mouseleave", onLeave);
      };
    }
  }, []);

  // ── Scroll-in reveal ──
  const addRevealRef = useCallback((el: HTMLElement | null) => {
    if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("login-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, root: pageRef.current }
    );
    for (const el of revealRefs.current) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Stats count-up trigger ──
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStatsVisible(true); observer.disconnect(); } },
      { threshold: 0.5, root: pageRef.current }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleNavCta = () => {
    cardRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleDiscordLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/auth/discord");
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "无法获取 Discord 授权链接");
        setIsLoading(false);
      }
    } catch {
      setError("网络错误，请检查连接后重试");
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page" ref={pageRef}>
      {/* ── Navigation bar ── */}
      <nav className={`login-nav${navScrolled ? " login-nav--scrolled" : ""}`}>
        <div className="login-nav-inner">
          <div className="login-nav-brand">
            <img className="login-nav-logo" src="/go2mars-favicon.jpg" alt="Logo" />
            <span className="login-nav-name">YunyingBot</span>
          </div>
          <button className="login-nav-cta" type="button" onClick={handleNavCta}>
            登录
          </button>
        </div>
      </nav>

      {/* ── Layered background ── */}
      <div className="login-bg-photo" ref={bgRef} />
      <div className="login-bg-overlay" />
      <div className="login-bg-orbs" ref={orbRef}>
        <div className="login-orb login-orb--1" />
        <div className="login-orb login-orb--2" />
        <div className="login-orb login-orb--3" />
      </div>
      <div className="login-bg-grid" />
      <div className="login-geo login-geo--1" />
      <div className="login-geo login-geo--2" />
      <div className="login-geo login-geo--3" />

      {/* ═══ HERO ═══ */}
      <section className="login-section login-hero-section">
        <div className="login-hero-split">
          <div className="login-hero-left" ref={heroLeftRef}>
            <div className="login-hero-badge">
              <span className="login-badge-dot" />
              Web3 运营智能平台
            </div>

            <h1>
              用数据驱动
              <br />
              <span className="login-highlight">社区增长决策</span>
            </h1>

            <p className="login-hero-subtitle">
              多维度采集、AI 智能分析、风险评估
              <br />
              让每个运营决策都有据可依
            </p>

            <div className="login-hero-stats" ref={statsRef}>
              <div className="login-stat">
                <span className="login-stat-num">{statDim}</span>
                <span className="login-stat-label">评估维度</span>
              </div>
              <div className="login-stat">
                <span className="login-stat-num">{statSrc}+</span>
                <span className="login-stat-label">数据源</span>
              </div>
              <div className="login-stat">
                <span className="login-stat-num">AI</span>
                <span className="login-stat-label">智能分析</span>
              </div>
            </div>
          </div>

          <div className="login-hero-right">
            <div className="login-card" ref={cardRef}>
              <div className="login-card-glow" />
              <div className="login-card-header">
                <img className="login-card-logo" src="/go2mars-favicon.jpg" alt="Logo" />
                <h2>登录 YunyingBot</h2>
                <p>使用 Discord 账户授权登录</p>
              </div>

              <div className="login-form">
                {error && <div className="login-error">{error}</div>}
                <button
                  type="button"
                  className="login-discord-btn"
                  disabled={isLoading}
                  onClick={handleDiscordLogin}
                >
                  <svg className="login-discord-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {isLoading ? "跳转中..." : "使用 Discord 登录"}
                </button>
                <p className="login-discord-hint">
                  授权后将获取您的 Discord 账户信息和服务器列表
                </p>
              </div>
              <div className="login-footer">Go2Mars 运营智能平台</div>
            </div>
          </div>
        </div>

        <div className="login-scroll-hint">
          <span>了解更多</span>
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="login-section login-features-section">
        <div className="login-features">
          <h2 className="login-features-title login-reveal" ref={addRevealRef}>
            为什么选择 YunyingBot
          </h2>
          <p className="login-features-subtitle login-reveal login-reveal-delay-1" ref={addRevealRef}>
            覆盖 Web3 项目运营评估的完整链路
          </p>

          <div className="login-features-grid">
            {([
              { icon: "\u{1F50D}", title: "全方位数据采集", desc: "Twitter、Telegram、Discord、链上数据、白皮书 —— 一键采集项目全貌" },
              { icon: "\u{1F9E0}", title: "AI 多维分析", desc: "产品成熟度、社区健康度、Bot 风险、增长潜力 —— 六大维度深度评估" },
              { icon: "\u26A1", title: "实时风险预警", desc: "交叉验证可信度、异常互动检测、综合风险等级 —— 预警先于损失" },
            ] as const).map((item, i) => (
              <div
                key={i}
                className={`login-feature-card login-reveal login-reveal-delay-${i + 1}`}
                ref={(el) => { addRevealRef(el); featureCardRefs.current[i] = el; }}
              >
                <div className="login-feature-icon">{item.icon}</div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
