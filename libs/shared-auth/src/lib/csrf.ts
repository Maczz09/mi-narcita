// Un solo lugar para el nombre de la cookie CSRF: la emite auth.controller.ts
// (login/refresh) y la valida JwtAuthGuard en los 11 servicios. Un rebrand
// que renombre esto sin tocar ambos lados vuelve a romper todo mutating
// request de la app con 403 "Token CSRF inválido o ausente" (pasó una vez).
export const CSRF_COOKIE_NAME = 'restoapp.csrf_token';
