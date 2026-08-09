# Docker secrets (plan 2.3)

Esta carpeta contiene los archivos de secreto que monta
`docker-compose.secrets.yml`. **El contenido real está gitignorado** (solo se
versiona este README). Cada archivo contiene el valor en claro de un secreto, sin
salto de línea final innecesario.

Archivos esperados:

| Archivo | Contenido |
|---------|-----------|
| `jwt-dev.env` | variables JWT dev generadas por `npm run dev:keys` para `docker-compose.yml` |
| `jwt_private_key` | PEM RS256 privada (solo identidad) |
| `jwt_public_key` | PEM RS256 pública |
| `service_jwt_secret` | secreto HS256 para tokens de servicio |
| `rabbitmq_uri` | `amqp://user:pass@rabbitmq:5672` |
| `database_url_<servicio>` | URL completa de la BD de ese servicio |
| `sunat_pfx_empresa_<1\|2>` | Certificado digital SUNAT (.pfx binario), uno por RUC |
| `sunat_pfx_empresa_<1\|2>_pass` | Contraseña del .pfx |
| `sunat_sol_user_empresa_<1\|2>` | Usuario SOL (SUNAT Operaciones en Línea) de esa empresa |
| `sunat_sol_pass_empresa_<1\|2>` | Clave SOL de esa empresa |

Generación rápida (ejemplo):

```sh
cd infra/secrets
node ../../scripts/generate-jwt-keys.mjs | while IFS='=' read -r k v; do
  case "$k" in
    JWT_PRIVATE_KEY) printf '%s' "$v" | sed 's/\\n/\n/g' > jwt_private_key ;;
    JWT_PUBLIC_KEY)  printf '%s' "$v" | sed 's/\\n/\n/g' > jwt_public_key ;;
  esac
done
printf '%s' "$(openssl rand -base64 48)" > service_jwt_secret
printf '%s' 'amqp://nachopps:CAMBIAR@rabbitmq:5672' > rabbitmq_uri
printf '%s' 'postgresql://nachopps:CAMBIAR@db-identidad:5432/identidad_db?schema=public' > database_url_identidad
# …una database_url_<servicio> por cada BD
```

Ver `docs/operacion/secrets.md` para el flujo completo.
