FROM kong:3.9

USER root
RUN apt-get update && apt-get install -y gettext-base && rm -rf /var/lib/apt/lists/*

COPY plugins/jwt-cache /usr/local/share/lua/5.1/kong/plugins/jwt-cache
COPY kong.yml.template /tmp/kong.yml.template
COPY docker-entrypoint-wrapper.sh /docker-entrypoint-wrapper.sh

RUN sed -i 's/\r$//' /docker-entrypoint-wrapper.sh && \
    chmod +x /docker-entrypoint-wrapper.sh && mkdir -p /kong && chown kong:kong /kong && chown kong:kong /tmp/kong.yml.template

USER kong

ENV KONG_PLUGINS=bundled,jwt-cache
ENV KONG_DATABASE=off
ENV KONG_DECLARATIVE_CONFIG=/kong/kong.yml

ENTRYPOINT ["/docker-entrypoint-wrapper.sh"]
CMD ["kong", "docker-start"]
