-- Ejecutar en Supabase → SQL Editor
-- Si pedidos.id es BIGINT (numérico) en lugar de UUID, cambia la línea de pedido_id

CREATE TABLE IF NOT EXISTS kds_tiempos (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pedido_id        uuid        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  pantalla         text        NOT NULL CHECK (pantalla IN ('cocina', 'barra')),
  iniciado_at      timestamptz NOT NULL DEFAULT now(),
  listo_at         timestamptz,
  tiempo_segundos  integer
);

CREATE INDEX IF NOT EXISTS idx_kds_tiempos_pedido   ON kds_tiempos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_kds_tiempos_pantalla ON kds_tiempos(pantalla);
CREATE INDEX IF NOT EXISTS idx_kds_tiempos_iniciado ON kds_tiempos(iniciado_at DESC);

-- RLS: permitir acceso con la clave anon
ALTER TABLE kds_tiempos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kds_anon_all" ON kds_tiempos
  FOR ALL
  USING (true)
  WITH CHECK (true);
