#!/bin/bash
# Run this once on the EC2 instance to provision TLS certs
# Replace livingtable.example.com and the email below
set -e

DOMAIN="livingtable.example.com"
EMAIL="admin@example.com"

sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive

echo "TLS certificate provisioned for $DOMAIN"
echo "Auto-renewal is enabled via systemd timer"
