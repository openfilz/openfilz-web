FROM nginxinc/nginx-unprivileged:alpine-perl
COPY dist/openfilz-ui/browser /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Regenerate ngx-env.js from NG_APP_* env at each container start; make the served
# file writable by the nginx user.
USER root
COPY docker-entrypoint.d/25-openfilz-ngx-env.sh /docker-entrypoint.d/25-openfilz-ngx-env.sh
RUN chmod +x /docker-entrypoint.d/25-openfilz-ngx-env.sh \
 && chown nginx:nginx /usr/share/nginx/html/ngx-env.js

USER nginx

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]