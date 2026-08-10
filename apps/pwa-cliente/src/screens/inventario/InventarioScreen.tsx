/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { useMemo, useState, useEffect, type SubmitEvent } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useInventarioQuery } from '../../hooks/queries/useInventarioQuery';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { ProductoTable } from '../../components/inventario/ProductoTable';
import { NuevoProductoForm } from '../../components/inventario/NuevoProductoForm';
import { RegistrarMermaModal } from '../../components/inventario/RegistrarMermaModal';
import { MermasHistorialDrawer } from '../../components/inventario/MermasHistorialDrawer';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { INITIAL_PRODUCT, STOCK_BAJO, computeInventarioKpis } from '../../domain/inventario';
import type { CrearProductoPayload, ProductoVM } from '../../types/inventario.types';

export function InventarioScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const [categoriaId, setCategoriaId] = useState('');
  const [search, setSearch] = useState('');
  const {
    categorias, productos, nextCursor, loading, loadingMore, saving, error, success,
    fetch, fetchMore, crearProducto, actualizarProducto, reponerStock, clearFeedback,
  } = useInventarioQuery(categoriaId || undefined, { conStock: true, search: search.trim() || undefined });

  const { registrarMerma, saving: savingMerma } = useMermasQuery();
  const [productoForm, setProductoForm] = useState<CrearProductoPayload>(INITIAL_PRODUCT);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [mermaProducto, setMermaProducto] = useState<ProductoVM | null>(null);
  const [historialMermas, setHistorialMermas] = useState(false);

  useEffect(() => {
    const el = document.querySelector('.content');
    if (el) el.classList.add('has-form');
    return () => {
      if (el) el.classList.remove('has-form');
    };
  }, []);

  const productosPorCategoria = useMemo(
    () => categorias.map((cat) => ({ categoria: cat, productos: productos.filter((p) => p.categoriaId === cat.id) })),
    [categorias, productos],
  );

  const kpis = useMemo(() => computeInventarioKpis(productos), [productos]);

  const grupos = categoriaId
    ? [{ categoria: categorias.find((c) => c.id === categoriaId), productos }]
    : productosPorCategoria;

  const handleCrear = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!online) return;
    try {
      await crearProducto({
        ...productoForm,
        categoriaId: productoForm.categoriaId || categorias[0]?.id,
        nombre: productoForm.nombre.trim(),
        descripcion: productoForm.descripcion?.trim() || undefined,
        precio: Number(productoForm.precio) || 0,
        stockActual: Number(productoForm.stockActual) || 0,
      });
      setProductoForm(INITIAL_PRODUCT);
    } catch (err) {
      toast({ title: 'No se pudo crear el producto', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const updateForm = (key: keyof CrearProductoPayload, value: string | number | boolean) =>
    setProductoForm((prev) => ({ ...prev, [key]: value }));

  const handleReponer = async (productoId: string) => {
    const cantidad = Number(stockInputs[productoId]) || 0;
    if (cantidad <= 0 || !online) return;
    try {
      await reponerStock(productoId, cantidad);
      setStockInputs((prev) => ({ ...prev, [productoId]: '' }));
    } catch (err) {
      toast({ title: 'No se pudo reponer el stock', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const handleRegistrarMerma = async (cantidad: number, motivo: string) => {
    if (!mermaProducto || !online) return;
    try {
      await registrarMerma({ productoId: mermaProducto.id, cantidad, motivo });
      toast({ title: 'Merma registrada', msg: `${mermaProducto.nombre} · -${cantidad}`, icon: 'Check' });
      setMermaProducto(null);
    } catch (err) {
      toast({ title: 'No se pudo registrar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div>
      <div className="page-h">
        <div>
          <h1>Inventario</h1>
          <div className="sub">Productos, disponibilidad y reposición de stock</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => setHistorialMermas(true)}>
          <Icons.Alert s={15} /> Historial de mermas
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar" aria-label="Refrescar inventario">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. Las mutaciones están deshabilitadas.</span>
        </output>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Inventario" tint="accent" label="En esta vista" value={kpis.total} />
        <StatKpi icon="Check" tint="ok" label="Disponibles" value={kpis.disponibles} />
        <StatKpi icon="Alert" tint="warn" label={`Stock bajo (≤${STOCK_BAJO})`} value={kpis.bajo} />
        <StatKpi icon="Alert" tint="danger" label="Agotados" value={kpis.agotados} />
      </div>

      <div className="module-toolbar">
        <div className="search-box">
          <Icons.Search s={16} />
          <input
            type="search"
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar productos"
          />
        </div>
        <span className="spacer" />
        <div className="input toolbar-input">
          <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Filtrar por categoría">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="module-grid">
        <section className="panel">
          <div className="panel-h">
            <h3>Productos</h3>
            <span className="spacer" />
            <span className="badge badge-info">{productos.length} productos</span>
          </div>
          <ProductoTable
            grupos={grupos}
            loading={loading}
            stockInputs={stockInputs}
            onStockInput={(id, val) => setStockInputs((prev) => ({ ...prev, [id]: val }))}
            saving={saving}
            online={online}
            onToggleDisponible={(p) => { if (!saving) { actualizarProducto(p.id, { disponible: !p.disponible }).catch((e: unknown) => toast({ title: 'No se pudo actualizar el producto', msg: e instanceof Error ? e.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' })); } }}
            onReponer={handleReponer}
            onReponerQuick={(id, cant) => { if (online) { reponerStock(id, cant).catch((e: unknown) => toast({ title: 'No se pudo reponer el stock', msg: e instanceof Error ? e.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' })); } }}
            onRegistrarMerma={setMermaProducto}
            nextCursor={nextCursor}
            loadingMore={loadingMore}
            onLoadMore={fetchMore}
          />
        </section>

        <NuevoProductoForm
          categorias={categorias}
          form={productoForm}
          onChange={updateForm}
          onSubmit={handleCrear}
          saving={saving}
          online={online}
        />
      </div>

      {mermaProducto && (
        <RegistrarMermaModal
          producto={mermaProducto}
          saving={savingMerma}
          onClose={() => setMermaProducto(null)}
          onSave={handleRegistrarMerma}
        />
      )}

      {historialMermas && <MermasHistorialDrawer onClose={() => setHistorialMermas(false)} />}
    </div>
  );
}
