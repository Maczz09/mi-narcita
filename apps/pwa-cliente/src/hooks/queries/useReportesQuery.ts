import { useQuery } from '@tanstack/react-query';
import * as reportesApi from '../../api/reportes.api';
import { mapResumen } from '../../mappers/reporte.mapper';
import { retrySalvo404, refetchSiError } from '../../api/queryClient';

export const REPORTES_QUERY_KEY = ['reportes', 'resumen'];

export function useReportesQuery() {
  const resumenQuery = useQuery({
    queryKey: REPORTES_QUERY_KEY,
    queryFn: async () => {
      const dto = await reportesApi.getResumen();
      return mapResumen(dto);
    },
    staleTime: 1000 * 30,
    retry: retrySalvo404,
    refetchInterval: refetchSiError,
  });

  return {
    resumen: resumenQuery.data ?? null,
    loading: resumenQuery.isLoading,
    error: resumenQuery.error ? resumenQuery.error.message : null,
    fetch: resumenQuery.refetch,
  };
}
