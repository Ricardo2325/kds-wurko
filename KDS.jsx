import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { createClient } from '@supabase/supabase-js';

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://iogurdgwuodqtnffimjk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nxWZg_FtbUloMi1vWnDcrw_KnYzrxM-';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BARRA_CATS = new Set([
  'bebidas refrescos', 'agua', 'zumos y batidos',
  'cervezas', 'vino', 'cafes', 'infusiones',
]);

// ─── Global CSS ───────────────────────────────────────────────────────────────

if (typeof document !== 'undefined' && !document.getElementById('kds-css')) {
  const s = document.createElement('style');
  s.id = 'kds-css';
  s.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #0f172a; overflow: hidden; }
    #root { height: 100%; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
    button { cursor: pointer; font-family: inherit; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
    .btn:active { transform: scale(0.96); }
    @keyframes pulse-red {
      0%, 100% { border-left-color: #ef4444; }
      50%       { border-left-color: #fca5a5; box-shadow: -3px 0 14px rgba(239,68,68,0.45); }
    }
    .card-urgent { animation: pulse-red 1.6s ease-in-out infinite; }
    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .card-enter { animation: slide-in 0.22s ease-out; }
    .hold-btn { position: relative; overflow: hidden; user-select: none; -webkit-user-select: none; touch-action: none; }
    .hold-fill { position: absolute; left: 0; top: 0; height: 100%; background: rgba(255,255,255,0.18); pointer-events: none; }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BARRA_MOD_LABELS = new Set(['bebida', 'bebidas', 'refresco', 'drink']);

function parseModificaciones(str, pantalla) {
  if (!str) return null;
  const parts = str.split(/,\s*/);
  return parts
    .map((part) => {
      const idx = part.indexOf(':');
      if (idx === -1) return { label: null, value: part.trim() };
      return { label: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() };
    })
    .filter((p) => {
      if (!p.value) return false;
      if (pantalla === 'cocina' && p.label && BARRA_MOD_LABELS.has(p.label.toLowerCase())) return false;
      return true;
    });
}

function parseEntrega(notas) {
  if (!notas) return null;
  const m = notas.match(/entrega:\s*(\d{1,2}:\d{2})/i);
  if (m) return m[1];
  if (/entrega:\s*lo antes posible/i.test(notas)) return 'ahora';
  return null;
}

function notasSinEntrega(notas) {
  if (!notas) return '';
  return notas.replace(/entrega:[^\n\r]*/gi, '').replace(/\n{2,}/g, '\n').trim();
}

function entregaToDate(str, ref) {
  if (!str || str === 'ahora') return null;
  const [h, m] = str.split(':').map(Number);
  const d = new Date(ref);
  d.setHours(h, m, 0, 0);
  return d;
}

function secsElapsed(dateStr, now) {
  return Math.max(0, Math.floor((now - new Date(dateStr)) / 1000));
}

function fmtElapsed(secs) {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function fmtHora(dateStr) {
  return new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function shortId(id, codigoPedido) {
  if (codigoPedido) return codigoPedido;
  const s = String(id ?? '???');
  return /^\d+$/.test(s) ? `#${s}` : `#${s.slice(-4).toUpperCase()}`;
}

function getUrgencia(pedido, now) {
  if (pedido.estado === 'preparando') return 'preparando';
  const entrega = parseEntrega(pedido.notas);
  if (!entrega || entrega === 'ahora') {
    return secsElapsed(pedido.created_at, now) > 15 * 60 ? 'urgente' : 'ok';
  }
  const d = entregaToDate(entrega, now);
  return d && now >= d ? 'urgente' : 'ok';
}

function isProximo(pedido, now) {
  if (pedido.estado === 'preparando') return false;
  const entrega = parseEntrega(pedido.notas);
  if (!entrega || entrega === 'ahora') return false;
  const d = entregaToDate(entrega, now);
  return d ? (d - now) / 60000 > 30 : false;
}

// ─── HoldButton ───────────────────────────────────────────────────────────────

function HoldButton({ label, onComplete, duration = 3000, btnStyle }) {
  const [pct, setPct] = useState(0);
  const rafRef = useRef(null);
  const t0Ref = useRef(null);

  const cancel = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    t0Ref.current = null;
    setPct(0);
  }, []);

  const start = useCallback((e) => {
    e.preventDefault();
    t0Ref.current = performance.now();
    const tick = (now) => {
      if (!t0Ref.current) return;
      const p = Math.min(((now - t0Ref.current) / duration) * 100, 100);
      setPct(p);
      if (p < 100) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        t0Ref.current = null;
        setPct(0);
        onComplete();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, onComplete]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <button
      className="hold-btn btn"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
        color: '#64748b', fontSize: 12, padding: '0 14px', height: 40,
        whiteSpace: 'nowrap', ...btnStyle,
      }}
    >
      <span className="hold-fill" style={{ width: `${pct}%` }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
    </button>
  );
}

// ─── PedidoCard ───────────────────────────────────────────────────────────────

function PedidoCard({ pedido, prods, now, pantalla, onPreparar, onListo, onVolver }) {
  const urgencia = getUrgencia(pedido, now);
  const entrega  = parseEntrega(pedido.notas);
  const nota     = notasSinEntrega(pedido.notas);
  const secs     = secsElapsed(pedido.created_at, now);

  const borderColor = urgencia === 'urgente' ? '#ef4444'
    : urgencia === 'preparando'              ? '#fbbf24'
    :                                          '#22c55e';

  const timerColor = urgencia === 'urgente' ? '#fca5a5'
    : urgencia === 'preparando'             ? '#fde68a'
    :                                         '#64748b';

  const entregaLabel = !entrega || entrega === 'ahora' ? 'AHORA' : entrega;
  const entregaColor = urgencia === 'urgente' ? '#fca5a5' : '#e2e8f0';

  return (
    <div
      className={`card-enter${urgencia === 'urgente' ? ' card-urgent' : ''}`}
      style={{
        background: '#1e293b', borderRadius: 10, borderLeft: `5px solid ${borderColor}`,
        padding: '22px 18px', display: 'flex', flexDirection: 'column', gap: 18,
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#f1f5f9', lineHeight: 1, letterSpacing: '0.04em' }}>
            {shortId(pedido.id, pedido.codigo_pedido)}
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#94a3b8', lineHeight: 1.2, marginTop: 4, wordBreak: 'break-word' }}>
            {pedido.empresa || 'Cliente'}
          </div>
          <div style={{ fontSize: 16, color: '#475569', marginTop: 4 }}>
            llegó {fmtHora(pedido.created_at)}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: entregaColor, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {entregaLabel}
          </div>
          <div style={{ fontSize: 12, color: timerColor, fontFamily: 'monospace', fontWeight: 600, marginTop: 5 }}>
            ⏱ {fmtElapsed(secs)}
            {urgencia === 'urgente'    && ' ¡TARDE!'}
            {urgencia === 'preparando' && ' · prep.'}
          </div>
        </div>
      </div>

      {/* Products */}
      <div style={{ borderTop: '1px solid #334155', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {prods.map((p) => (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#64748b', lineHeight: 1.4, minWidth: 32, flexShrink: 0 }}>
              {p.cantidad}×
            </span>
            <div>
              <div style={{ fontSize: 21, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>
                {p.nombre}
              </div>
              {parseModificaciones(p.modificaciones, pantalla)?.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 800, color: '#0f172a',
                    background: '#64748b', borderRadius: 3,
                    padding: '2px 6px', flexShrink: 0, letterSpacing: '0.04em',
                  }}>
                    {m.label ?? i + 1}
                  </span>
                  <span style={{ fontSize: 17, color: '#cbd5e1', fontWeight: 500 }}>
                    {m.value}
                  </span>
                </div>
              ))}
              {p.extras_pedido?.length > 0 && (
                <div style={{ fontSize: 17, color: '#60a5fa' }}>
                  + {p.extras_pedido.map((e) => e.descripcion).join(' · ')}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Extra note */}
      {nota ? (
        <div style={{
          fontSize: 13, color: '#fbbf24', background: 'rgba(251,191,36,0.08)',
          borderRadius: 6, padding: '5px 8px', fontStyle: 'italic',
          borderLeft: '2px solid #854d0e',
        }}>
          {nota}
        </div>
      ) : null}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        {pedido.estado === 'pendiente' && (
          <button
            className="btn"
            onClick={() => onPreparar(pedido.id)}
            style={{
              flex: 1, height: 52, border: 'none', borderRadius: 8,
              background: '#92400e', color: '#fef3c7', fontSize: 14,
              fontWeight: 700, letterSpacing: '0.04em',
            }}
          >
            EN PREPARACIÓN
          </button>
        )}
        {pedido.estado === 'preparando' && (
          <>
            <button
              className="btn"
              onClick={() => onVolver(pedido.id)}
              title="Volver a pendiente"
              style={{
                width: 52, height: 52, border: 'none', borderRadius: 8,
                background: '#1e3a5f', color: '#93c5fd', fontSize: 20, flexShrink: 0,
              }}
            >
              ↩
            </button>
            <button
              className="btn"
              onClick={() => onListo(pedido.id)}
              style={{
                flex: 1, height: 52, border: 'none', borderRadius: 8,
                background: '#166534', color: '#bbf7d0', fontSize: 15,
                fontWeight: 700, letterSpacing: '0.04em',
              }}
            >
              ✓ LISTO
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SplashScreen ─────────────────────────────────────────────────────────────

function SplashScreen({ pantalla, color, onStart }) {
  return (
    <div
      onClick={onStart}
      style={{
        background: '#0f172a', height: '100vh', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 24, cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 18, color: '#334155', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
        Wurko Padel · KDS
      </div>
      <div style={{ fontSize: 80, fontWeight: 900, color, letterSpacing: '0.12em' }}>
        {pantalla}
      </div>
      <div style={{
        background: color, color: '#0f172a', fontWeight: 800, fontSize: 16,
        padding: '14px 40px', borderRadius: 12, letterSpacing: '0.06em',
      }}>
        TOCAR PARA INICIAR
      </div>
      <div style={{ fontSize: 12, color: '#1e293b', marginTop: 8 }}>
        Se abrirá en pantalla completa
      </div>
    </div>
  );
}

// ─── KDS ──────────────────────────────────────────────────────────────────────

export default function KDS() {
  const [pantalla,   setPantalla]   = useState(null);
  const [pedidos,    setPedidos]    = useState([]);
  const [catMap,     setCatMap]     = useState(null);
  const [now,        setNow]        = useState(new Date());
  const [connected,  setConnected]  = useState(true);
  const [kdsMode,    setKdsMode]    = useState(false);
  const [error,      setError]      = useState(null);

  // Parse URL param
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('pantalla');
    setPantalla(p === 'barra' ? 'barra' : 'cocina');
  }, []);

  // 1-second clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Prevent accidental navigation
  useEffect(() => {
    if (!kdsMode) return;
    const fn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [kdsMode]);

  // Load product→category map
  useEffect(() => {
    supabase
      .from('productos')
      .select('nombre, categoria')
      .eq('activo', true)
      .then(({ data, error: err }) => {
        if (err) { console.error(err); setCatMap({}); return; }
        const m = {};
        (data || []).forEach((p) => {
          if (p.nombre) m[p.nombre.toLowerCase().trim()] = (p.categoria || '').toLowerCase().trim();
        });
        setCatMap(m);
      });
  }, []);

  // Category → screen check
  const isForScreen = useCallback((nombre) => {
    if (!nombre) return false;
    if (!catMap || Object.keys(catMap).length === 0) return true; // unknown → show everywhere
    const cat = catMap[nombre.toLowerCase().trim()];
    if (cat === undefined) return true; // not in catalog → show on both
    return pantalla === 'barra' ? BARRA_CATS.has(cat) : !BARRA_CATS.has(cat);
  }, [catMap, pantalla]);

  const filterProds = useCallback((rawProds) =>
    (rawProds || []).filter((p) => isForScreen(p.nombre)),
  [isForScreen]);

  const processOrders = useCallback((raw) =>
    raw
      .map((o) => ({ ...o, _prods: filterProds(o.productos_pedido) }))
      .filter((o) => o._prods.length > 0)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
  [filterProds]);

  const fetchOrder = useCallback(async (id) => {
    const { data } = await supabase
      .from('pedidos')
      .select(`
        id, codigo_pedido, empresa, estado, total, notas, forma_pago, created_at,
        productos_pedido (
          id, pedido_id, nombre, cantidad, precio_unitario, modificaciones,
          extras_pedido ( id, descripcion, precio )
        )
      `)
      .eq('id', id)
      .single();
    return data;
  }, []);

  // Initial load + realtime
  useEffect(() => {
    if (pantalla === null || catMap === null) return;

    supabase
      .from('pedidos')
      .select(`
        id, codigo_pedido, empresa, estado, total, notas, forma_pago, created_at,
        productos_pedido (
          id, pedido_id, nombre, cantidad, precio_unitario, modificaciones,
          extras_pedido ( id, descripcion, precio )
        )
      `)
      .in('estado', ['pendiente', 'preparando'])
      .order('created_at', { ascending: true })
      .then(({ data, error: err }) => {
        if (err) { setError('Error al cargar pedidos'); return; }
        setPedidos(processOrders(data || []));
      });

    const channel = supabase
      .channel(`kds-${pantalla}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, async (payload) => {
        const { eventType, new: n, old: o } = payload;

        if (eventType === 'DELETE') {
          setPedidos((prev) => prev.filter((p) => p.id !== o?.id));
          return;
        }
        if (['listo', 'entregado'].includes(n.estado)) {
          setPedidos((prev) => prev.filter((p) => p.id !== n.id));
          return;
        }
        if (!['pendiente', 'preparando'].includes(n.estado)) return;

        if (eventType === 'INSERT') {
          const full = await fetchOrder(n.id);
          if (!full) return;
          const prods = filterProds(full.productos_pedido);
          if (prods.length === 0) return;
          setPedidos((prev) => {
            const rest = prev.filter((p) => p.id !== full.id);
            return [...rest, { ...full, _prods: prods }]
              .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
          });
        } else if (eventType === 'UPDATE') {
          setPedidos((prev) =>
            prev.map((p) => p.id === n.id ? { ...p, estado: n.estado } : p)
          );
        }
      })
      .subscribe((status) => {
        setConnected(!['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status));
      });

    return () => { supabase.removeChannel(channel); };
  }, [pantalla, catMap, processOrders, filterProds, fetchOrder]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const handlePreparar = useCallback(async (pedidoId) => {
    const { error: err } = await supabase
      .from('pedidos').update({ estado: 'preparando' }).eq('id', pedidoId);
    if (err) {
      console.error('handlePreparar error:', JSON.stringify(err));
      setError(`Error: ${err.message || err.code || 'desconocido'}`);
      return;
    }
    await supabase.from('kds_tiempos').insert({
      pedido_id: pedidoId, pantalla, iniciado_at: new Date().toISOString(),
    });
    setPedidos((prev) => prev.map((p) => p.id === pedidoId ? { ...p, estado: 'preparando' } : p));
  }, [pantalla]);

  const handleListo = useCallback(async (pedidoId) => {
    const listoAt = new Date();
    const { data: rows } = await supabase
      .from('kds_tiempos')
      .select('id, iniciado_at')
      .eq('pedido_id', pedidoId).eq('pantalla', pantalla).is('listo_at', null)
      .order('iniciado_at', { ascending: false }).limit(1);
    const tiempo = rows?.[0];

    const { error: err } = await supabase
      .from('pedidos').update({ estado: 'listo' }).eq('id', pedidoId);
    if (err) { setError('Error al marcar listo'); return; }

    if (tiempo) {
      await supabase.from('kds_tiempos').update({
        listo_at: listoAt.toISOString(),
        tiempo_segundos: Math.floor((listoAt - new Date(tiempo.iniciado_at)) / 1000),
      }).eq('id', tiempo.id);
    }
    setPedidos((prev) => prev.filter((p) => p.id !== pedidoId));
  }, [pantalla]);

  const handleVolver = useCallback(async (pedidoId) => {
    await supabase.from('pedidos').update({ estado: 'pendiente' }).eq('id', pedidoId);
    setPedidos((prev) => prev.map((p) => p.id === pedidoId ? { ...p, estado: 'pendiente' } : p));
  }, []);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleSalir = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setKdsMode(false);
  }, []);

  const handleStart = useCallback(() => {
    document.documentElement.requestFullscreen().catch(() => {});
    setKdsMode(true);
  }, []);

  // ── Sections ──────────────────────────────────────────────────────────────────

  const { principales, proximos } = useMemo(() => {
    const principales = [], proximos = [];
    pedidos.forEach((p) => (isProximo(p, now) ? proximos : principales).push(p));
    return { principales, proximos };
  }, [pedidos, now]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const pantallaLabel = pantalla === 'barra' ? 'BARRA' : 'COCINA';
  const pantallaColor = pantalla === 'barra' ? '#0ea5e9' : '#f97316';
  const isLoading     = pantalla === null || catMap === null;

  if (isLoading) {
    return (
      <div style={{
        background: '#0f172a', height: '100vh', display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 36 }}>⏳</div>
        <div style={{ fontSize: 16, color: '#475569' }}>Iniciando KDS…</div>
      </div>
    );
  }

  if (!kdsMode) {
    return <SplashScreen pantalla={pantallaLabel} color={pantallaColor} onStart={handleStart} />;
  }

  return (
    <div style={{
      background: '#0f172a', height: '100vh', overflow: 'hidden',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      color: '#e2e8f0', display: 'flex', flexDirection: 'column',
      userSelect: 'none', WebkitUserSelect: 'none',
    }}>

      {/* ── Header ── */}
      <header style={{
        background: '#0a1122', borderBottom: `3px solid ${pantallaColor}`,
        height: 56, padding: '0 16px', display: 'flex', alignItems: 'center',
        gap: 14, flexShrink: 0, zIndex: 100,
      }}>
        <span style={{
          fontSize: 26, fontWeight: 900, color: pantallaColor,
          letterSpacing: '0.12em', minWidth: 100,
        }}>
          {pantallaLabel}
        </span>

        <span style={{
          background: '#1e293b', borderRadius: 20, padding: '3px 12px',
          fontSize: 14, fontWeight: 700, color: '#f1f5f9',
        }}>
          {principales.length} pedido{principales.length !== 1 ? 's' : ''}
          {proximos.length > 0 && (
            <span style={{ color: '#64748b', fontWeight: 400 }}>
              {' · '}{proximos.length} próx.
            </span>
          )}
        </span>

        <span style={{ fontSize: 13, color: '#334155', fontFamily: 'monospace' }}>
          {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>

        {!connected && (
          <span style={{ fontSize: 12, color: '#fca5a5', background: '#450a0a', padding: '3px 8px', borderRadius: 6 }}>
            ⚠ Sin conexión
          </span>
        )}
        {error && (
          <span
            onClick={() => setError(null)}
            style={{ fontSize: 12, color: '#fca5a5', background: '#450a0a', padding: '3px 8px', borderRadius: 6, cursor: 'pointer' }}
          >
            ⚠ {error} ×
          </span>
        )}

        <div style={{ flex: 1 }} />

        <HoldButton
          label="⊗ Salir KDS (mantén 3s)"
          duration={3000}
          onComplete={handleSalir}
        />

        <button
          className="btn"
          onClick={handleFullscreen}
          title="Pantalla completa"
          style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
            color: '#94a3b8', width: 40, height: 40, fontSize: 17,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          ⛶
        </button>
      </header>

      {/* ── Content ── */}
      <main style={{ flex: 1, padding: '12px 16px', overflowY: 'auto', height: 0 }}>

        {principales.length === 0 && proximos.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 12, color: '#1e3a5f',
          }}>
            <div style={{ fontSize: 68 }}>✓</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#334155' }}>Sin pedidos activos</div>
            <div style={{ fontSize: 13, color: '#1e3a5f' }}>Esperando nuevos pedidos…</div>
          </div>
        ) : (
          <>
            {/* Active grid */}
            {principales.length > 0 && (
              <div className="kds-grid" style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 14, alignItems: 'start',
                marginBottom: proximos.length > 0 ? 20 : 0,
              }}>
                {principales.map((pedido) => (
                  <PedidoCard
                    key={pedido.id}
                    pedido={pedido}
                    prods={pedido._prods}
                    now={now}
                    pantalla={pantalla}
                    onPreparar={handlePreparar}
                    onListo={handleListo}
                    onVolver={handleVolver}
                  />
                ))}
              </div>
            )}

            {/* Próximos */}
            {proximos.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#334155',
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                  }}>
                    PRÓXIMOS · más de 30 min
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#1e293b' }} />
                </div>
                <div className="kds-grid" style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 14, alignItems: 'start', opacity: 0.45, filter: 'saturate(0.3)',
                }}>
                  {proximos.map((pedido) => (
                    <PedidoCard
                      key={pedido.id}
                      pedido={pedido}
                      prods={pedido._prods}
                      now={now}
                      pantalla={pantalla}
                      onPreparar={handlePreparar}
                      onListo={handleListo}
                      onVolver={handleVolver}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
