#!/bin/bash
# Script à exécuter sur le VPS après déploiement
# À adapter selon tes besoins

set -e

# Chemin du dossier où le build est copié
TARGET_PATH="/var/www/ton-app" # À adapter si besoin

# Droits (optionnel)
chown -R www-data:www-data "$TARGET_PATH"
chmod -R 755 "$TARGET_PATH"

# Redémarrer nginx
sudo systemctl reload nginx

echo "Déploiement terminé et Nginx rechargé."
