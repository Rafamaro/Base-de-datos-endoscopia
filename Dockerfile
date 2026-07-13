FROM nginx:alpine

ENV DIRECTUS_URL=https://directus.drperez86.com

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY index.html viewer.html stats.html /usr/share/nginx/html/
COPY CNAME /usr/share/nginx/html/CNAME

EXPOSE 80
