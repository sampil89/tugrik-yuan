import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Menu, X, Send, MessageCircle, Mail, Phone, Lock, LogOut, RefreshCw,
  Check, PencilLine, Newspaper, Megaphone, ChevronRight, ExternalLink,
  Loader2, ShieldCheck, AlertTriangle, Inbox, Trash2, ArrowRight,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Данные и константы
 * ------------------------------------------------------------------ */

const CURRENCIES = [
  { code: "RUB", label: "Российский рубль", short: "₽" },
  { code: "USD", label: "Доллар США", short: "$" },
  { code: "CNY", label: "Китайский юань", short: "¥" },
];

// Ориентировочные резервные значения (сколько тугриков за 1 единицу валюты).
// Используются только если API недоступен — их нужно периодически актуализировать вручную.
const FALLBACK_RATES = { RUB: 43.4, USD: 3565, CNY: 497 };

const SOCIAL_LINKS = {
  vk: "https://vk.com/",
  telegramChannel: "https://t.me/OtherMongolia",
  telegramChat: "https://t.me/chatOtherMongolia",
  email: "mailto:info@tugrikyuan.mn",
};

/* ------------------------------------------------------------------ *
 * Утилиты
 * ------------------------------------------------------------------ */

function formatNumber(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatTime(date) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
}

// Все данные теперь живут в Postgres (Vercel Postgres) и приходят через
// serverless-функции в /api. credentials: "include" нужен, чтобы браузер
// отправлял cookie сессии администратора вместе с запросом.
async function apiRequest(path, options = {}) {
  try {
    const res = await fetch(path, {
      credentials: "include",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      ...options,
    });
    if (!res.ok) {
      let message = `Ошибка запроса (${res.status})`;
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch (_) {}
      return { ok: false, status: res.status, error: message };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, error: "Сеть недоступна" };
  }
}

/* ------------------------------------------------------------------ *
 * Курсы валют: живые данные + ручной override администратора
 * ------------------------------------------------------------------ */

function useCurrencyRates() {
  const [apiRates, setApiRates] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [status, setStatus] = useState("loading"); // loading | live | fallback
  const [updatedAt, setUpdatedAt] = useState(null);
  const [overridesLoaded, setOverridesLoaded] = useState(false);

  const fetchRates = useCallback(async () => {
    setStatus((prev) => (prev === "live" ? "live" : "loading"));
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/MNT");
      const data = await res.json();
      const r = data && data.rates;
      if (r && r.RUB && r.USD && r.CNY) {
        setApiRates({ RUB: 1 / r.RUB, USD: 1 / r.USD, CNY: 1 / r.CNY });
        setStatus("live");
      } else {
        throw new Error("empty payload");
      }
    } catch (e) {
      setStatus((prev) => (prev === "live" ? "live" : "fallback"));
    } finally {
      setUpdatedAt(new Date());
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 30 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchRates]);

  useEffect(() => {
    (async () => {
      const res = await apiRequest("/api/rates");
      if (res.ok && res.overrides) setOverrides(res.overrides);
      setOverridesLoaded(true);
    })();
  }, []);

  const saveOverride = useCallback(
    async (code, rawValue) => {
      const value = rawValue === null || rawValue === "" ? null : Number(rawValue);
      const res = await apiRequest("/api/rates", {
        method: "PUT",
        body: JSON.stringify({ code, value }),
      });
      if (res.ok) {
        setOverrides((prev) => {
          const next = { ...prev };
          if (value === null) delete next[code];
          else next[code] = value;
          return next;
        });
      }
      return res;
    },
    []
  );

  const baseRates = apiRates || FALLBACK_RATES;

  const rates = useMemo(() => {
    const merged = {};
    CURRENCIES.forEach(({ code }) => {
      const overridden = overrides[code] != null;
      merged[code] = {
        value: overridden ? overrides[code] : baseRates[code],
        isOverridden: overridden,
      };
    });
    return merged;
  }, [overrides, baseRates]);

  return { rates, status, updatedAt, refresh: fetchRates, saveOverride, overrides, overridesLoaded };
}

/* ------------------------------------------------------------------ *
 * Хук админ-сессии (клиентская, временная — см. TODO выше)
 * ------------------------------------------------------------------ */

function useAdminSession() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiRequest("/api/admin/session");
      setIsAdmin(Boolean(res.ok && res.isAdmin));
      setChecked(true);
    })();
  }, []);

  const login = useCallback(async (password) => {
    const res = await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    if (res.ok) setIsAdmin(true);
    return res.ok;
  }, []);

  const logout = useCallback(async () => {
    await apiRequest("/api/admin/logout", { method: "POST" });
    setIsAdmin(false);
  }, []);

  return { isAdmin, checked, login, logout };
}

/* ------------------------------------------------------------------ *
 * Шапка
 * ------------------------------------------------------------------ */

function Header({ onOpenAdmin }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: "Курс валют", href: "#rates", ready: true },
    { label: "Трансфер", href: "#transfer", ready: false },
    { label: "База знаний", href: "#knowledge", ready: false },
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        <a href="#top" className="logo">
          <span className="logo-mark">TY</span>
          <span className="logo-text">Tugrik&nbsp;Yuan</span>
        </a>

        <nav className="nav-desktop" aria-label="Основная навигация">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={"nav-link" + (item.ready ? "" : " nav-link-soon")}
              onClick={(e) => {
                if (!item.ready) e.preventDefault();
              }}
            >
              {item.label}
              {!item.ready && <span className="soon-tag">скоро</span>}
            </a>
          ))}
        </nav>

        <div className="header-actions">
          <div className="social-row" aria-label="Соцсети">
            <a href={SOCIAL_LINKS.vk} target="_blank" rel="noreferrer" aria-label="ВКонтакте" className="icon-btn">
              <span className="vk-glyph" aria-hidden="true">VK</span>
            </a>
            <a href={SOCIAL_LINKS.telegramChannel} target="_blank" rel="noreferrer" aria-label="Telegram-канал" className="icon-btn">
              <Send size={17} strokeWidth={2} />
            </a>
            <a href={SOCIAL_LINKS.email} aria-label="Почта" className="icon-btn">
              <Mail size={17} strokeWidth={2} />
            </a>
          </div>
          <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
            <MessageCircle size={16} strokeWidth={2} />
            Написать в чат
          </a>
        </div>

        <button
          className="menu-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {menuOpen && (
        <div className="nav-mobile">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="nav-mobile-link"
              onClick={(e) => {
                if (!item.ready) e.preventDefault();
                else setMenuOpen(false);
              }}
            >
              {item.label} {!item.ready && <span className="soon-tag">скоро</span>}
            </a>
          ))}
          <div className="nav-mobile-socials">
            <a href={SOCIAL_LINKS.vk} target="_blank" rel="noreferrer" className="icon-btn"><span className="vk-glyph">VK</span></a>
            <a href={SOCIAL_LINKS.telegramChannel} target="_blank" rel="noreferrer" className="icon-btn"><Send size={17} /></a>
            <a href={SOCIAL_LINKS.email} className="icon-btn"><Mail size={17} /></a>
          </div>
          <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
            <MessageCircle size={16} /> Написать в чат
          </a>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * Hero + форма заявки
 * ------------------------------------------------------------------ */

const emptyLead = {
  name: "",
  contact: "",
  route: "УУ→УБ",
  date: "",
  passengers: 1,
  comment: "",
  consent: false,
  website: "", // honeypot
};

function ApplicationForm() {
  const [values, setValues] = useState(emptyLead);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState("idle"); // idle | sending | success | error

  const update = (field) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setValues((v) => ({ ...v, [field]: val }));
  };

  const validate = () => {
    const next = {};
    if (!values.name.trim()) next.name = "Укажите имя";
    const contactOk = /^\+?\d{7,15}$/.test(values.contact.trim()) || /^@?[a-zA-Z0-9_]{4,32}$/.test(values.contact.trim());
    if (!contactOk) next.contact = "Телефон или @username в Telegram";
    if (!values.date) next.date = "Выберите дату";
    if (!values.passengers || values.passengers < 1) next.passengers = "Минимум 1 пассажир";
    if (!values.consent) next.consent = "Нужно согласие на обработку данных";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (values.website) return; // honeypot — тихо игнорируем
    if (!validate()) return;

    setState("sending");
    // Заявка уходит в /api/leads → пишется в Postgres. Уведомление в Telegram/почту
    // подключим на следующем этапе прямо внутри этого эндпоинта.
    const res = await apiRequest("/api/leads", {
      method: "POST",
      body: JSON.stringify(values),
    });

    if (res.ok) {
      setState("success");
      setValues(emptyLead);
    } else {
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div className="form-card form-success">
        <Check size={28} strokeWidth={2} />
        <h3>Заявка принята</h3>
        <p>Мы свяжемся с вами по указанному контакту. Если срочно — напишите прямо в чат.</p>
        <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          <MessageCircle size={16} /> Открыть чат
        </a>
        <button className="text-link" onClick={() => setState("idle")}>Оставить ещё одну заявку</button>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <h3 className="form-title">Оставить заявку на трансфер</h3>

      <div className="field">
        <label htmlFor="name">Имя</label>
        <input id="name" type="text" placeholder="Как к вам обращаться" value={values.name} onChange={update("name")} />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="field">
        <label htmlFor="contact">Контакт</label>
        <input id="contact" type="text" placeholder="Телефон или @username" value={values.contact} onChange={update("contact")} />
        {errors.contact && <span className="field-error">{errors.contact}</span>}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="route">Маршрут</label>
          <select id="route" value={values.route} onChange={update("route")}>
            <option value="УУ→УБ">Улан-Удэ → Улан-Батор</option>
            <option value="УБ→УУ">Улан-Батор → Улан-Удэ</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="passengers">Пассажиров</label>
          <input id="passengers" type="number" min="1" max="10" value={values.passengers} onChange={update("passengers")} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="date">Дата поездки</label>
        <input id="date" type="date" value={values.date} onChange={update("date")} />
        {errors.date && <span className="field-error">{errors.date}</span>}
      </div>

      <div className="field">
        <label htmlFor="comment">Комментарий</label>
        <textarea id="comment" rows={2} placeholder="Багаж, пожелания по времени и т.п." value={values.comment} onChange={update("comment")} />
      </div>

      {/* honeypot — скрыто от человека, видно ботам */}
      <input
        type="text"
        name="website"
        value={values.website}
        onChange={update("website")}
        autoComplete="off"
        tabIndex={-1}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        aria-hidden="true"
      />

      <label className="consent-row">
        <input type="checkbox" checked={values.consent} onChange={update("consent")} />
        <span>
          Согласен на обработку персональных данных согласно{" "}
          <a href="#privacy" onClick={(e) => e.preventDefault()} className="text-link-inline">
            политике конфиденциальности
          </a>{" "}
          <span className="soon-tag">страница скоро</span>
        </span>
      </label>
      {errors.consent && <span className="field-error">{errors.consent}</span>}

      <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={state === "sending"}>
        {state === "sending" ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
        {state === "sending" ? "Отправка…" : "Отправить заявку"}
      </button>

      {state === "error" && (
        <p className="form-note form-note-error">
          <AlertTriangle size={14} /> Не получилось отправить. Напишите нам напрямую в{" "}
          <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer">чат</a>.
        </p>
      )}
      <p className="form-note">
        Приём заявок в Telegram-бот появится на следующем этапе — сейчас заявки видит администратор сайта.
      </p>
    </form>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-sky" aria-hidden="true">
        <svg viewBox="0 0 1200 400" preserveAspectRatio="none" className="horizon-svg">
          <polyline points="0,320 120,300 260,330 400,270 560,310 720,260 880,300 1040,280 1200,320"
            fill="none" stroke="rgba(200,155,60,0.35)" strokeWidth="2" />
          <polyline points="0,360 150,345 320,365 500,335 680,355 860,330 1040,350 1200,340"
            fill="none" stroke="rgba(200,155,60,0.2)" strokeWidth="2" />
        </svg>
      </div>
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="eyebrow">Улан-Удэ ⇄ Улан-Батор</p>
          <h1>
            Трансфер через границу.<br />Курс тугрика — на одной странице.
          </h1>
          <p className="hero-sub">
            Везём людей и посылки между Бурятией и Монголией. Живой курс рубля, доллара и юаня к тугрику
            обновляется каждые полчаса — не нужно искать обменник, чтобы прикинуть сумму.
          </p>
          <div className="hero-actions">
            <a href="#apply" className="btn btn-primary">
              Оставить заявку <ArrowRight size={16} />
            </a>
            <a href="#rates" className="btn btn-ghost">Смотреть курс валют</a>
          </div>
          <div className="hero-contacts">
            <a href={SOCIAL_LINKS.telegramChannel} target="_blank" rel="noreferrer" className="hero-contact-link">
              <Send size={15} /> @OtherMongolia
            </a>
            <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer" className="hero-contact-link">
              <MessageCircle size={15} /> Чат поддержки
            </a>
          </div>
        </div>
        <div className="hero-form" id="apply">
          <ApplicationForm />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Курс валют — «табло»
 * ------------------------------------------------------------------ */

function CurrencyBoard({ rates, status, updatedAt, refresh }) {
  return (
    <section className="rates-section" id="rates">
      <div className="rates-inner">
        <div className="rates-header">
          <div>
            <p className="eyebrow eyebrow-dark">Курс валют</p>
            <h2>Тугрик к рублю, доллару и юаню</h2>
          </div>
          <button className="refresh-btn" onClick={refresh} aria-label="Обновить курс">
            <RefreshCw size={15} className={status === "loading" ? "spin" : ""} />
            {formatTime(updatedAt)}
          </button>
        </div>

        <div className="board">
          {CURRENCIES.map(({ code, label, short }) => {
            const r = rates[code];
            return (
              <div className="board-row" key={code}>
                <div className="board-code">
                  <span className="board-code-main">{code}</span>
                  <span className="board-code-label">{label}</span>
                </div>
                <div className="board-value">
                  <span className="board-digits">{formatNumber(r?.value, code === "USD" ? 0 : 1)}</span>
                  <span className="board-unit">MNT за 1 {short}</span>
                </div>
                {r?.isOverridden && (
                  <span className="override-badge" title="Значение задано администратором вручную">
                    <PencilLine size={12} /> вручную
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="rates-footnote">
          {status === "fallback"
            ? "Не удалось получить актуальный курс — показаны резервные значения."
            : "Курс ориентировочный, в обменных пунктах может отличаться."}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Футер
 * ------------------------------------------------------------------ */

function Footer({ isAdmin, onOpenAdmin, onLogout }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-col">
          <div className="logo">
            <span className="logo-mark logo-mark-light">TY</span>
            <span className="logo-text">Tugrik&nbsp;Yuan</span>
          </div>
          <p className="footer-tagline">Трансфер и курс валют между Бурятией и Монголией.</p>
        </div>

        <div className="footer-col">
          <p className="footer-heading">Контакты</p>
          <a href={SOCIAL_LINKS.telegramChannel} target="_blank" rel="noreferrer" className="footer-link"><Send size={14} /> Telegram-канал</a>
          <a href={SOCIAL_LINKS.telegramChat} target="_blank" rel="noreferrer" className="footer-link"><MessageCircle size={14} /> Чат поддержки</a>
          <a href={SOCIAL_LINKS.vk} target="_blank" rel="noreferrer" className="footer-link"><span className="vk-glyph" style={{ width: 14, fontSize: 10 }}>VK</span> ВКонтакте</a>
          <a href={SOCIAL_LINKS.email} className="footer-link"><Mail size={14} /> Почта</a>
        </div>

        <div className="footer-col">
          <p className="footer-heading">Информация</p>
          <a href="#privacy" onClick={(e) => e.preventDefault()} className="footer-link">
            Политика конфиденциальности <span className="soon-tag">скоро</span>
          </a>
          <a href="#transfer" onClick={(e) => e.preventDefault()} className="footer-link">
            Об услуге трансфера <span className="soon-tag">скоро</span>
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Tugrik Yuan</span>
        {isAdmin ? (
          <div className="admin-status">
            <span className="admin-chip"><ShieldCheck size={13} /> Вы вошли как администратор</span>
            <button className="text-link" onClick={onOpenAdmin}>Панель</button>
            <button className="text-link" onClick={onLogout}>Выйти</button>
          </div>
        ) : (
          <button className="text-link" onClick={onOpenAdmin}>
            <Lock size={12} /> Вход для администратора
          </button>
        )}
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ *
 * Админ: вход
 * ------------------------------------------------------------------ */

function AdminLoginModal({ onClose, onLogin }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const ok = await onLogin(password);
    setBusy(false);
    if (!ok) setError("Неверный пароль");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        <div className="modal-icon"><Lock size={20} /></div>
        <h3>Вход администратора</h3>
        <p className="modal-sub">Доступ к ручному изменению курса, новостей и объявлений.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="admin-password">Пароль</label>
            <input
              id="admin-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
            />
            {error && <span className="field-error">{error}</span>}
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
            Войти
          </button>
        </form>
        <p className="modal-note">
          Временная клиентская проверка для прототипа. Перед запуском заменить на серверную авторизацию.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Админ-панель
 * ------------------------------------------------------------------ */

function RatesTab({ rates, overrides, saveOverride, status }) {
  const [drafts, setDrafts] = useState({});

  const draftFor = (code) => (drafts[code] !== undefined ? drafts[code] : (overrides[code] ?? ""));

  return (
    <div className="admin-tab-content">
      <p className="admin-tab-desc">
        Значение перекрывает данные из API до тех пор, пока вы его не очистите.
        {status === "fallback" && " Сейчас сайт показывает резервные значения — можно временно выставить их вручную."}
      </p>
      {CURRENCIES.map(({ code, label }) => (
        <div className="rate-edit-row" key={code}>
          <div className="rate-edit-label">
            <span>{code}</span>
            <span className="rate-edit-sub">{label}</span>
          </div>
          <input
            type="number"
            step="0.1"
            placeholder={formatNumber(rates[code]?.value, 1)}
            value={draftFor(code)}
            onChange={(e) => setDrafts((d) => ({ ...d, [code]: e.target.value }))}
          />
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { saveOverride(code, draftFor(code)); }}
          >
            <Check size={14} /> Сохранить
          </button>
          {overrides[code] != null && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { saveOverride(code, null); setDrafts((d) => ({ ...d, [code]: "" })); }}
            >
              Сбросить к API
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ListEditorTab({ apiEndpoint, icon: Icon, emptyText, fields, futureNote }) {
  const [items, setItems] = useState(null);
  const [draft, setDraft] = useState({});

  const load = useCallback(async () => {
    const res = await apiRequest(apiEndpoint);
    setItems(res.ok && res.items ? res.items : []);
  }, [apiEndpoint]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!draft[fields[0].key]?.trim()) return;
    const res = await apiRequest(apiEndpoint, { method: "POST", body: JSON.stringify(draft) });
    if (res.ok) {
      setDraft({});
      load();
    }
  };

  const remove = async (id) => {
    const res = await apiRequest(`${apiEndpoint}?id=${id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  if (items === null) {
    return <div className="admin-tab-content admin-tab-loading"><Loader2 size={18} className="spin" /></div>;
  }

  return (
    <div className="admin-tab-content">
      <p className="admin-tab-desc">{futureNote}</p>
      <div className="editor-form">
        {fields.map((f) => (
          f.type === "textarea" ? (
            <textarea
              key={f.key}
              rows={2}
              placeholder={f.placeholder}
              value={draft[f.key] || ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          ) : (
            <input
              key={f.key}
              type="text"
              placeholder={f.placeholder}
              value={draft[f.key] || ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
          )
        ))}
        <button className="btn btn-secondary btn-sm" onClick={add}>
          <PencilLine size={14} /> Добавить
        </button>
      </div>

      {items.length === 0 ? (
        <div className="editor-empty"><Icon size={20} /><span>{emptyText}</span></div>
      ) : (
        <ul className="editor-list">
          {items.map((item) => (
            <li key={item.id} className="editor-list-item">
              <div>
                <p className="editor-item-title">{item[fields[0].key]}</p>
                {fields[1] && <p className="editor-item-sub">{item[fields[1].key]}</p>}
              </div>
              <button className="icon-btn" onClick={() => remove(item.id)} aria-label="Удалить"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadsTab() {
  const [leads, setLeads] = useState(null);

  useEffect(() => {
    (async () => {
      const res = await apiRequest("/api/leads");
      setLeads(res.ok && res.leads ? res.leads : []);
    })();
  }, []);

  if (leads === null) {
    return <div className="admin-tab-content admin-tab-loading"><Loader2 size={18} className="spin" /></div>;
  }

  return (
    <div className="admin-tab-content">
      <p className="admin-tab-desc">
        Заявки с формы. Автоматическая отправка в Telegram-бот появится на следующем этапе — пока проверяйте их здесь.
      </p>
      {leads.length === 0 ? (
        <div className="editor-empty"><Inbox size={20} /><span>Заявок пока нет</span></div>
      ) : (
        <ul className="editor-list">
          {leads.map((lead) => (
            <li key={lead.id} className="editor-list-item lead-item">
              <div>
                <p className="editor-item-title">{lead.name} · {lead.route}</p>
                <p className="editor-item-sub">
                  {lead.contact} · {lead.date} · {lead.passengers} пас.
                  {lead.comment ? ` · ${lead.comment}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminPanel({ onClose, ratesApi }) {
  const [tab, setTab] = useState("rates");

  const tabs = [
    { id: "rates", label: "Курс валют", icon: RefreshCw },
    { id: "leads", label: "Заявки", icon: Inbox },
    { id: "news", label: "Новости", icon: Newspaper },
    { id: "board", label: "Объявления", icon: Megaphone },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal admin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        <h3>Панель администратора</h3>

        <div className="admin-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={"admin-tab" + (tab === t.id ? " admin-tab-active" : "")}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === "rates" && (
          <RatesTab
            rates={ratesApi.rates}
            overrides={ratesApi.overrides}
            saveOverride={ratesApi.saveOverride}
            status={ratesApi.status}
          />
        )}
        {tab === "leads" && <LeadsTab />}
        {tab === "news" && (
          <ListEditorTab
            apiEndpoint="/api/news"
            icon={Newspaper}
            emptyText="Новостей пока нет"
            futureNote="Лента новостей на главной странице появится на следующем этапе — уже сейчас можно готовить контент."
            fields={[
              { key: "title", placeholder: "Заголовок новости" },
              { key: "text", placeholder: "Текст новости", type: "textarea" },
            ]}
          />
        )}
        {tab === "board" && (
          <ListEditorTab
            apiEndpoint="/api/announcements"
            icon={Megaphone}
            emptyText="Объявлений пока нет"
            futureNote="Публичная доска объявлений будет добавлена на следующем этапе — записи уже сохраняются."
            fields={[
              { key: "title", placeholder: "Заголовок объявления" },
              { key: "text", placeholder: "Текст и контакт", type: "textarea" },
            ]}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Приложение
 * ------------------------------------------------------------------ */

export default function App() {
  const ratesApi = useCurrencyRates();
  const admin = useAdminSession();
  const [modal, setModal] = useState(null); // null | "login" | "panel"

  const openAdminEntry = () => setModal(admin.isAdmin ? "panel" : "login");

  return (
    <div className="ty-app">
      <style>{`
        .ty-app {
          --bg: #E9E3D3;
          --ink: #1B2A3A;
          --panel: #14202E;
          --panel-light: #21324459;
          --gold: #C89B3C;
          --gold-deep: #A87F2C;
          --azure: #2E6E8E;
          --cream: #FBF8F1;
          --line: rgba(27,42,58,0.14);
          --danger: #B4402C;
          --success: #3B6D11;
          font-family: 'Manrope', system-ui, sans-serif;
          color: var(--ink);
          background: var(--bg);
          line-height: 1.5;
          width: 100%;
        }
        .ty-app * { box-sizing: border-box; }
        .ty-app h1, .ty-app h2, .ty-app h3 { font-family: 'Unbounded', 'Manrope', sans-serif; margin: 0; letter-spacing: -0.01em; }
        .ty-app a { color: inherit; text-decoration: none; }
        .ty-app button { font-family: inherit; cursor: pointer; }
        .ty-app input, .ty-app select, .ty-app textarea { font-family: inherit; }
        .spin { animation: ty-spin 1s linear infinite; }
        @keyframes ty-spin { to { transform: rotate(360deg); } }

        .eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 12px; text-transform: uppercase; letter-spacing: 0.12em; color: var(--gold-deep); margin: 0 0 10px; }
        .eyebrow-dark { color: var(--gold); }

        .btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 8px; font-weight: 700; font-size: 14px; border: 1px solid transparent; transition: transform .12s ease, background .12s ease; }
        .btn:active { transform: scale(0.98); }
        .btn-primary { background: var(--gold); color: var(--panel); }
        .btn-primary:hover { background: var(--gold-deep); }
        .btn-secondary { background: var(--cream); color: var(--ink); border-color: var(--line); }
        .btn-secondary:hover { background: #F1ECDD; }
        .btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
        .btn-ghost:hover { background: rgba(27,42,58,0.06); }
        .btn-sm { padding: 8px 14px; font-size: 13px; }

        .text-link { background: none; border: none; padding: 0; color: var(--azure); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; }
        .text-link-inline { color: var(--azure); text-decoration: underline; }

        .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; border: 1px solid var(--line); background: transparent; }
        .vk-glyph { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }
        .soon-tag { font-family: 'JetBrains Mono', monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; background: rgba(27,42,58,0.08); color: var(--ink); padding: 2px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle; }

        /* Header */
        .site-header { position: sticky; top: 0; z-index: 30; background: rgba(233,227,211,0.92); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
        .header-inner { max-width: 1160px; margin: 0 auto; padding: 14px 24px; display: flex; align-items: center; gap: 24px; }
        .logo { display: flex; align-items: center; gap: 10px; margin-right: auto; }
        .logo-mark { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 8px; background: var(--panel); color: var(--gold); font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 13px; }
        .logo-mark-light { background: var(--gold); color: var(--panel); }
        .logo-text { font-family: 'Unbounded', sans-serif; font-weight: 600; font-size: 16px; }
        .nav-desktop { display: flex; gap: 22px; }
        .nav-link { font-size: 14px; font-weight: 500; padding: 6px 0; border-bottom: 2px solid transparent; }
        .nav-link:hover { border-color: var(--gold); }
        .nav-link-soon { color: rgba(27,42,58,0.55); cursor: default; }
        .nav-link-soon:hover { border-color: transparent; }
        .header-actions { display: flex; align-items: center; gap: 16px; }
        .social-row { display: flex; gap: 8px; }
        .menu-toggle { display: none; background: none; border: none; }
        .nav-mobile { display: none; }

        @media (max-width: 860px) {
          .nav-desktop, .header-actions { display: none; }
          .menu-toggle { display: flex; }
          .nav-mobile { display: flex; flex-direction: column; gap: 14px; padding: 16px 24px 22px; border-top: 1px solid var(--line); }
          .nav-mobile-link { font-size: 15px; font-weight: 600; }
          .nav-mobile-socials { display: flex; gap: 10px; margin: 4px 0; }
        }

        /* Hero */
        .hero { position: relative; background: linear-gradient(180deg, var(--panel) 0%, #1c2c3d 100%); color: #F2EEE2; overflow: hidden; padding: 64px 24px 84px; }
        .hero-sky { position: absolute; inset: 0; opacity: 0.6; }
        .horizon-svg { width: 100%; height: 100%; }
        .hero-inner { position: relative; max-width: 1160px; margin: 0 auto; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: start; }
        .hero-copy h1 { font-size: 38px; line-height: 1.15; color: #FBF8F1; margin-bottom: 18px; }
        .hero-sub { font-size: 16px; color: rgba(251,248,241,0.78); max-width: 46ch; margin-bottom: 28px; }
        .hero-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 26px; }
        .hero .btn-ghost { color: #F2EEE2; border-color: rgba(251,248,241,0.35); }
        .hero .btn-ghost:hover { background: rgba(251,248,241,0.08); }
        .hero-contacts { display: flex; gap: 20px; flex-wrap: wrap; }
        .hero-contact-link { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: rgba(251,248,241,0.75); }
        .hero-contact-link:hover { color: var(--gold); }

        .form-card { background: var(--cream); border-radius: 14px; padding: 26px; box-shadow: 0 20px 50px rgba(10,16,24,0.28); display: flex; flex-direction: column; gap: 14px; }
        .form-title { font-size: 18px; margin-bottom: 4px; color: var(--panel); }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field label { font-size: 12px; font-weight: 700; color: rgba(27,42,58,0.65); }
        .field input, .field select, .field textarea {
          border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 14px; background: #fff; color: var(--ink); resize: vertical;
        }
        .field input:focus, .field select:focus, .field textarea:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(200,155,60,0.18); }
        .field-error { font-size: 12px; color: var(--danger); }
        .consent-row { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: rgba(27,42,58,0.75); }
        .consent-row input { margin-top: 2px; }
        .form-note { font-size: 12px; color: rgba(27,42,58,0.55); display: flex; align-items: center; gap: 6px; }
        .form-note-error { color: var(--danger); }
        .form-success { align-items: flex-start; color: var(--ink); }
        .form-success svg { color: var(--success); }
        .form-success h3 { margin: 6px 0 2px; }
        .form-success p { font-size: 13.5px; color: rgba(27,42,58,0.7); margin: 0 0 6px; }

        @media (max-width: 900px) {
          .hero-inner { grid-template-columns: 1fr; }
          .hero-copy h1 { font-size: 30px; }
        }
        @media (max-width: 480px) {
          .field-row { grid-template-columns: 1fr; }
        }

        /* Rates board */
        .rates-section { background: var(--panel); padding: 60px 24px; }
        .rates-inner { max-width: 900px; margin: 0 auto; }
        .rates-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 26px; gap: 16px; flex-wrap: wrap; }
        .rates-header h2 { color: #F2EEE2; font-size: 24px; }
        .refresh-btn { display: flex; align-items: center; gap: 8px; background: rgba(251,248,241,0.06); border: 1px solid rgba(251,248,241,0.18); color: rgba(251,248,241,0.85); padding: 8px 14px; border-radius: 8px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
        .refresh-btn:hover { background: rgba(251,248,241,0.12); }

        .board { border: 1px solid rgba(251,248,241,0.14); border-radius: 12px; overflow: hidden; }
        .board-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 16px; padding: 20px 24px; border-bottom: 1px solid rgba(251,248,241,0.1); background: linear-gradient(180deg, rgba(251,248,241,0.02), rgba(251,248,241,0)); }
        .board-row:last-child { border-bottom: none; }
        .board-code { display: flex; flex-direction: column; min-width: 88px; }
        .board-code-main { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 16px; color: var(--gold); letter-spacing: 0.04em; }
        .board-code-label { font-size: 12px; color: rgba(251,248,241,0.55); }
        .board-value { display: flex; align-items: baseline; gap: 10px; justify-self: end; }
        .board-digits { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 28px; color: #F2EEE2; letter-spacing: 0.02em; }
        .board-unit { font-size: 12px; color: rgba(251,248,241,0.5); font-family: 'JetBrains Mono', monospace; }
        .override-badge { display: flex; align-items: center; gap: 4px; font-size: 10px; font-family: 'JetBrains Mono', monospace; color: var(--gold); background: rgba(200,155,60,0.14); padding: 4px 8px; border-radius: 20px; grid-column: 3; justify-self: end; }
        .rates-footnote { margin-top: 18px; font-size: 12.5px; color: rgba(251,248,241,0.5); }

        @media (max-width: 560px) {
          .board-row { grid-template-columns: 1fr; text-align: left; gap: 6px; }
          .board-value { justify-self: start; }
          .override-badge { justify-self: start; }
        }

        /* Footer */
        .site-footer { background: #12202D; color: rgba(251,248,241,0.75); padding: 48px 24px 20px; }
        .footer-inner { max-width: 1160px; margin: 0 auto; display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 32px; padding-bottom: 30px; border-bottom: 1px solid rgba(251,248,241,0.1); }
        .footer-tagline { font-size: 13px; margin-top: 10px; max-width: 32ch; color: rgba(251,248,241,0.55); }
        .footer-heading { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(251,248,241,0.45); margin-bottom: 12px; font-family: 'JetBrains Mono', monospace; }
        .footer-link { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding: 5px 0; color: rgba(251,248,241,0.8); }
        .footer-link:hover { color: var(--gold); }
        .footer-bottom { max-width: 1160px; margin: 18px auto 0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: rgba(251,248,241,0.4); flex-wrap: wrap; gap: 10px; }
        .footer-bottom .text-link { color: rgba(251,248,241,0.55); }
        .admin-status { display: flex; align-items: center; gap: 12px; }
        .admin-chip { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--gold); }

        @media (max-width: 700px) {
          .footer-inner { grid-template-columns: 1fr; gap: 22px; }
        }

        /* Modals */
        .modal-backdrop { position: fixed; inset: 0; background: rgba(15,22,30,0.55); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
        .modal { position: relative; background: var(--cream); color: var(--ink); border-radius: 14px; padding: 28px; width: 100%; max-width: 380px; }
        .admin-modal { max-width: 560px; }
        .modal-close { position: absolute; top: 14px; right: 14px; background: none; border: none; color: rgba(27,42,58,0.5); }
        .modal-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(200,155,60,0.15); color: var(--gold-deep); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .modal h3 { font-size: 18px; margin-bottom: 4px; }
        .modal-sub { font-size: 13px; color: rgba(27,42,58,0.6); margin: 0 0 18px; }
        .modal-note { font-size: 11.5px; color: rgba(27,42,58,0.45); margin-top: 14px; }

        .admin-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 18px 0 20px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
        .admin-tab { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; padding: 7px 12px; border-radius: 20px; background: transparent; border: 1px solid var(--line); color: rgba(27,42,58,0.65); }
        .admin-tab-active { background: var(--panel); color: var(--gold); border-color: var(--panel); }
        .admin-tab-content { display: flex; flex-direction: column; gap: 14px; max-height: 50vh; overflow-y: auto; }
        .admin-tab-desc { font-size: 12.5px; color: rgba(27,42,58,0.6); margin: 0; }
        .admin-tab-loading { align-items: center; padding: 20px; }

        .rate-edit-row { display: grid; grid-template-columns: 1.1fr 1fr auto auto; align-items: center; gap: 10px; }
        .rate-edit-label { display: flex; flex-direction: column; }
        .rate-edit-label span:first-child { font-family: 'JetBrains Mono', monospace; font-weight: 700; }
        .rate-edit-sub { font-size: 11px; color: rgba(27,42,58,0.55); }
        .rate-edit-row input { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; }

        .editor-form { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
        .editor-form input, .editor-form textarea { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 13px; }
        .editor-form button { align-self: flex-start; }
        .editor-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 28px 0; color: rgba(27,42,58,0.4); font-size: 13px; }
        .editor-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .editor-list-item { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
        .editor-item-title { font-size: 13.5px; font-weight: 700; margin: 0; }
        .editor-item-sub { font-size: 12px; color: rgba(27,42,58,0.6); margin: 2px 0 0; }
        .lead-item { align-items: center; }

        @media (max-width: 520px) {
          .rate-edit-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <Header onOpenAdmin={openAdminEntry} />
      <Hero />
      <CurrencyBoard rates={ratesApi.rates} status={ratesApi.status} updatedAt={ratesApi.updatedAt} refresh={ratesApi.refresh} />
      <Footer isAdmin={admin.isAdmin} onOpenAdmin={openAdminEntry} onLogout={admin.logout} />

      {modal === "login" && (
        <AdminLoginModal
          onClose={() => setModal(null)}
          onLogin={async (pwd) => {
            const ok = await admin.login(pwd);
            if (ok) setModal("panel");
            return ok;
          }}
        />
      )}
      {modal === "panel" && admin.isAdmin && (
        <AdminPanel onClose={() => setModal(null)} ratesApi={ratesApi} />
      )}
    </div>
  );
}
