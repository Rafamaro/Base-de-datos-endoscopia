FROM nginx:alpine

# Copiamos tu HTML al directorio por defecto de nginx
COPY index.html /usr/share/nginx/html/index.html

# (Opcional) Si después agregás assets (css/js/img), podés copiar todo el directorio:
# COPY . /usr/share/nginx/html

EXPOSE 80
