import { useMutation, useQuery } from '@tanstack/react-query';
import * as inventarioApi from '../../api/inventario.api';
import { mapMenuDiario } from '../../mappers/inventario.mapper';
import { queryClient, retrySalvo404, refetchSiError } from '../../api/queryClient';
import type { AgregarAlMenuPayload } from '../../types/inventario.types';
import { primerMensaje } from '../../utils/feedback';
import { INVENTARIO_PRODUCTOS_KEY } from './useInventarioQuery';

export const MENU_DIARIO_KEY = ['menu-diario'];

export function useMenuDiarioQuery(fecha?: string) {
  const menuQuery = useQuery({
    queryKey: [...MENU_DIARIO_KEY, fecha].filter((part) => part !== undefined),
    queryFn: async () => inventarioApi.getMenuDelDia(fecha),
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: MENU_DIARIO_KEY, exact: false, refetchType: 'active' });
  };

  const mutationAgregar = useMutation({
    mutationFn: async (payload: AgregarAlMenuPayload) => inventarioApi.agregarAlMenu(payload),
    onSuccess: () => {
      invalidar();
      // Si se creó un plato nuevo, también debe aparecer en la carta.
      void queryClient.invalidateQueries({ queryKey: INVENTARIO_PRODUCTOS_KEY, exact: false, refetchType: 'active' });
    },
  });

  const mutationActualizar = useMutation({
    mutationFn: async ({ id, disponible }: { id: string; disponible: boolean }) =>
      inventarioApi.actualizarMenuDiario(id, { disponible }),
    onSuccess: invalidar,
  });

  const mutationQuitar = useMutation({
    mutationFn: async (id: string) => inventarioApi.quitarDelMenu(id),
    onSuccess: invalidar,
  });

  const saving = mutationAgregar.isPending || mutationActualizar.isPending || mutationQuitar.isPending;
  const error = menuQuery.error || mutationAgregar.error || mutationActualizar.error || mutationQuitar.error;

  return {
    menu: menuQuery.data ? mapMenuDiario(menuQuery.data) : [],
    loading: menuQuery.isLoading,
    saving,
    error: error ? error.message : null,
    success: primerMensaje(
      [mutationAgregar.isSuccess, 'Agregado al menú del día.'],
      [mutationActualizar.isSuccess, 'Menú del día actualizado.'],
      [mutationQuitar.isSuccess, 'Quitado del menú del día.'],
    ),
    fetch: async () => {
      await menuQuery.refetch();
    },
    agregarAlMenu: async (payload: AgregarAlMenuPayload) => {
      return mutationAgregar.mutateAsync(payload);
    },
    actualizarDisponibilidad: async (id: string, disponible: boolean) => {
      return mutationActualizar.mutateAsync({ id, disponible });
    },
    quitarDelMenu: async (id: string) => {
      return mutationQuitar.mutateAsync(id);
    },
    clearFeedback: () => {
      mutationAgregar.reset();
      mutationActualizar.reset();
      mutationQuitar.reset();
    },
  };
}
