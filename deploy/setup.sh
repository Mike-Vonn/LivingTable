#!/bin/bash
# Full deployment setup on a fresh EC2 Ubuntu instance
set -e

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo DEBIAN_FRONTEND=noninteractive apt install -y nodejs nginx

# Clone and build (update REPO_URL before running)
cd /home/ubuntu
git clone <REPO_URL> living-table
cd living-table
npm install
npm run build

# Set up systemd service
sudo cp deploy/systemd/livingtable.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable livingtable
sudo systemctl start livingtable

# Set up nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/livingtable
sudo ln -sf /etc/nginx/sites-available/livingtable /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# TLS — run after DNS is pointed to this server and propagated
# sudo bash deploy/certbot-setup.sh

echo "LivingTable deployed. Set up DNS and run certbot-setup.sh for TLS."
echo "Edit /etc/systemd/system/livingtable.service and set LIVINGTABLE_JWT_SECRET."
