// components/comandero/Comandero.tsx — Toma de pedido unificada (Salón/Delivery/Llevar)
// Overlay cableado a APIs reales: productos desde useInventarioQuery, mesas desde
// useMesasQuery, y creación vía usePedidosQuery().crear.
// La lógica del carrito/contexto y el envío viven en useComanda + domain/comanda
// (T-22); aquí queda el cableado de queries y la presentación.

import { useMemo, useRef, useState } from 'react';
import { Icons, type IconName } from '../ui/icons';
import { useToast } from '../ui/ToastProvider';
import { fmt } from '../../utils/format';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useComanda } from '../../hooks/useComanda';
import { ContextoCanal } from './ContextoCanal';
import { ComandaCart } from './ComandaCart';
import type { Canal } from '../../domain/pedido.flow';

export type { Canal };

const CANALES: { key: Canal; label: string; ic: IconName }[] = [
  { key: 'SALON', label: 'Salón', ic: 'Mesas' },
  { key: 'DELIVERY', label: 'Delivery', ic: 'Delivery' },
  { key: 'LLEVAR', label: 'Para llevar', ic: 'Bag' },
];

export interface ComanderoProps {
  onClose: () => void;
  /** éxito al enviar (ej. refrescar o navegar) */
  onCreated?: () => void;
  initialCanal?: Canal;
  /** mesa física fijada (modo desde plano de mesas) */
  mesaId?: string;
  mesaNumero?: string;
  mesaUbicacion?: string;
  /** modo "agregar a cuenta abierta" */
  modoAgregar?: boolean;
}

export function Comandero({
  onClose,
  onCreated,
  initialCanal = 'SALON',
  mesaId,
  mesaNumero,
  mesaUbicacion,
  modoAgregar = false,
}: Readonly<ComanderoProps>) {
  const { toast } = useToast();
  const cmdRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(cmdRef, { active: true, onClose });
  const [cat, setCat] = useState<string>('TODAS');
  const [q, setQ] = useState('');
  const [activeTab, setActiveTab] = useState<'catalog' | 'cart'>('catalog');
  const search = q.trim();
  const {
    productos,
    categorias,
    loading: loadingInv,
    loadingMore: loadingMoreInv,
    nextCursor,
    fetchMore,
    error: errorInv,
  } = useInventarioQuery(undefined, { limit: 100, search: search || undefined });
  const { mesas } = useMesasQuery();
  const { crear } = usePedidosQuery(mesaId);

  const mesaLock = !!mesaId; // mesa ya definida desde el plano
  const mesasFisicas = useMemo(
    () => mesas.filter((m) => m.numeroRaw < 90).sort((a, b) => a.numeroRaw - b.numeroRaw),
    [mesas],
  );

  const cmd = useComanda({
    mesaId, mesaLock, initialCanal, modoAgregar, mesaNumero,
    mesas, mesasFisicas, crear, toast, onCreated, onClose,
  });

  const productosFiltrados = useMemo(
    () => productos.filter((p) => {
      const okCat = cat === 'TODAS' || p.categoriaNombre === cat;
      const okQ = !q || p.nombre.toLowerCase().includes(q.toLowerCase());
      return okCat && okQ && p.disponible;
    }),
    [productos, cat, q],
  );

  let titulo = 'Nuevo pedido';
  if (modoAgregar) titulo = `Agregar a Mesa ${mesaNumero ?? ''}`.trim();
  else if (mesaLock) titulo = `Nuevo pedido · Mesa ${mesaNumero ?? ''}`.trim();

  return (
    <div className="cmd-overlay">
      <dialog
        open
        className="cmd"
        ref={cmdRef}
        aria-modal="true"
        aria-label={titulo}
      >
        {/* Header */}
        <div className="cmd-head">
          <button className="icon-btn" onClick={onClose} title="Cerrar"><Icons.Close s={18} /></button>
          <h2>{titulo}</h2>
          {mesaLock ? (
            <span className="pill-soft" style={{ marginLeft: 2 }}>{mesaUbicacion ?? 'Salón'}{modoAgregar ? ' · cuenta abierta' : ''}</span>
          ) : (
            <ComanderoCanales cmd={cmd} />
          )}
          <span className="spacer" />
        </div>

        {/* Selector de pestañas para móvil/tablet */}
        <div className="cmd-tabs-mobile mobile-only">
          <button className={activeTab === 'catalog' ? 'on' : ''} onClick={() => setActiveTab('catalog')}>
            <Icons.Layers s={16} /> Carta
          </button>
          <button className={activeTab === 'cart' ? 'on' : ''} onClick={() => setActiveTab('cart')}>
            <Icons.Pedidos s={16} /> Pedido {cmd.totalItems > 0 && <span className="cnt-badge">{cmd.totalItems}</span>}
          </button>
        </div>

        {/* Barra de contexto */}
        <div className="cmd-context">
          <ContextoCanal
            canal={cmd.canal}
            mesaLock={mesaLock}
            mesaNumero={mesaNumero}
            mesaUbicacion={mesaUbicacion}
            mesasFisicas={mesasFisicas}
            selMesaId={cmd.effectiveMesaId}
            setSelMesaId={cmd.setSelMesaId}
            comensales={cmd.comensales}
            setComensales={cmd.setComensales}
            cliente={cmd.cliente} setCliente={cmd.setCliente}
            tel={cmd.tel} setTel={cmd.setTel}
            dir={cmd.dir} setDir={cmd.setDir}
            referencia={cmd.referencia} setReferencia={cmd.setReferencia}
            proveedor={cmd.proveedor} setProveedor={cmd.setProveedor}
            retiro={cmd.retiro} setRetiro={cmd.setRetiro}
          />
        </div>

        <div className="cmd-body">
          {/* Catálogo */}
          <div className={`cmd-catalog ${activeTab === 'catalog' ? 'active' : 'hidden-mobile'}`}>
            <div className="cmd-filters">
              <div className="cmd-cats">
                <button className={`chip ${cat === 'TODAS' ? 'on' : ''}`} onClick={() => setCat('TODAS')}>Todos</button>
                {categorias.map((c) => (
                  <button key={c.id} className={`chip ${cat === c.nombre ? 'on' : ''}`} onClick={() => setCat(c.nombre)}>{c.nombre}</button>
                ))}
              </div>
              <div className="input cmd-search"><Icons.Search s={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar plato…" /></div>
            </div>
            {errorInv && productos.length > 0 && (
              <div className="banner err module-feedback" role="alert">
                <Icons.Alert s={17} />
                <span>No se pudo actualizar el catálogo. Mostrando los últimos productos guardados.</span>
              </div>
            )}
            <div className="cmd-grid">
              {ComanderoEmptyGrid({ loadingInv, errorInv, productosLength: productos.length, productosFiltradosLength: productosFiltrados.length, nextCursor, loadingMoreInv, fetchMore }) ?? (
                <>
                  <ComanderoCatalogGrid productos={productosFiltrados} cmd={cmd} />
                  <ComanderoCargarMas nextCursor={nextCursor} loadingMoreInv={loadingMoreInv} fetchMore={fetchMore} />
                </>
              )}
            </div>
          </div>

          {/* Comanda */}
          <div className={`cmd-cart-wrap ${activeTab === 'cart' ? 'active' : 'hidden-mobile'}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <ComandaCart cmd={cmd} modoAgregar={modoAgregar} />
          </div>
        </div>
      </dialog>
    </div>
  );
}

// Tipos derivados de los hooks (fuente de verdad) para los sub-componentes de
// presentación: evita `any` sin duplicar las formas de datos ni acoplarse a DTOs.
type ComandaCtrl = ReturnType<typeof useComanda>;
type ProductoCatalogo = ReturnType<typeof useInventarioQuery>['productos'][number];
type NextCursor = ReturnType<typeof useInventarioQuery>['nextCursor'];
type FetchMore = ReturnType<typeof useInventarioQuery>['fetchMore'];

function ComanderoCanales({ cmd }: Readonly<{ cmd: ComandaCtrl }>) {
  return (
    <div className="cmd-canal seg">
      {CANALES.map((c) => {
        const Ic = Icons[c.ic];
        return (
          <button key={c.key} className={cmd.canal === c.key ? 'on' : ''} onClick={() => cmd.setCanal(c.key)}>
            <Ic s={15} /> {c.label}
          </button>
        );
      })}
    </div>
  );
}

function ComanderoCatalogGrid({ productos, cmd }: Readonly<{ productos: ProductoCatalogo[], cmd: ComandaCtrl }>) {
  return (
    <>
      {productos.map((p) => {
        const enCarrito = cmd.lines.find((l) => l.producto.id === p.id)?.cantidad ?? 0;
        return (
          <button key={p.id} className={`dish-card ${enCarrito ? 'has' : ''}`} onClick={() => cmd.addProducto(p)}>
            {enCarrito > 0 && <span className="dish-badge">{enCarrito}</span>}
            <div className="dish-cat">{p.categoriaNombre ?? '—'}</div>
            <div className="dish-name">{p.nombre}</div>
            <div className="dish-foot">
              <span className="dish-price mono">{fmt(p.precio)}</span>
            </div>
          </button>
        );
      })}
    </>
  );
}

function ComanderoCargarMas({ nextCursor, loadingMoreInv, fetchMore }: Readonly<{ nextCursor: NextCursor, loadingMoreInv: boolean, fetchMore: FetchMore }>) {
  if (!nextCursor) return null;
  return (
    <button className="dish-card" disabled={loadingMoreInv} onClick={() => { void fetchMore(); }}>
      <div className="dish-cat">Catálogo</div>
      <div className="dish-name">{loadingMoreInv ? 'Cargando...' : 'Cargar más productos'}</div>
      <div className="dish-foot">
        <span className="dish-price mono">Más resultados</span>
      </div>
    </button>
  );
}

function ComanderoEmptyGrid({ loadingInv, errorInv, productosLength, productosFiltradosLength, nextCursor, loadingMoreInv, fetchMore }: Readonly<{ loadingInv: boolean, errorInv?: string | null, productosLength: number, productosFiltradosLength: number, nextCursor: NextCursor, loadingMoreInv: boolean, fetchMore: FetchMore }>) {
  if (loadingInv && productosLength === 0) {
    return <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><b>Cargando carta…</b></div>;
  }
  // Sin caché previa y la carga falló: distinto de "sin resultados" — el
  // catálogo no cargó por una dependencia caída, no porque el filtro no
  // matchee nada. El hook ya reintenta y refetchea solo cada 5s (queryClient).
  if (errorInv && productosLength === 0) {
    return (
      <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}>
        <Icons.Alert s={26} /><b>No pudimos cargar el catálogo</b>
        <p>El servicio de inventario no responde.</p>
      </div>
    );
  }
  if (productosFiltradosLength === 0) {
    return (
      <>
        <div className="cmd-empty" style={{ gridColumn: '1 / -1' }}><Icons.Search s={26} /><b>Sin resultados</b><p>Ajusta la categoría o la búsqueda.</p></div>
        <ComanderoCargarMas nextCursor={nextCursor} loadingMoreInv={loadingMoreInv} fetchMore={fetchMore} />
      </>
    );
  }
  return null;
}
