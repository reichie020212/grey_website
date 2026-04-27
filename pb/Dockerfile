# PocketBase image — fetched directly from upstream GitHub releases so the
# supply chain is just GitHub itself. Bump PB_VERSION to upgrade; the build
# fails loudly if that version doesn't exist for the target arch.
FROM alpine:3.20 AS fetcher
ARG TARGETARCH
ARG PB_VERSION=0.37.4
RUN apk add --no-cache ca-certificates wget unzip
WORKDIR /tmp
RUN wget -O pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
  && unzip pb.zip \
  && chmod +x pocketbase

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget tini
COPY --from=fetcher /tmp/pocketbase /usr/local/bin/pocketbase
WORKDIR /pb

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://127.0.0.1:8090/api/health || exit 1

# tini reaps zombies; pocketbase serve runs the embedded SQLite + HTTP server.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data", "--migrationsDir=/pb/pb_migrations"]
