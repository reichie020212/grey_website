# Static-site image for Castiel "Lulu" Butay's biography site.
# Single stage — nginx:alpine serves the prebuilt-in-browser React + Babel app.
# nginx:alpine has linux/arm64 builds, so this image runs on Apple Silicon (Mac mini).
FROM nginx:alpine

# Replace nginx's default server block with ours (gzip, cache headers, CSP, SPA fallback).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy only the runtime assets — never the .git, markdown docs, or compose files.
COPY index.html styles.css app.jsx tweaks-panel.jsx /usr/share/nginx/html/

EXPOSE 80

# wget ships in busybox in nginx:alpine, so the healthcheck has no extra deps.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --spider --quiet http://localhost/ || exit 1
