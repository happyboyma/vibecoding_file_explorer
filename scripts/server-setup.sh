#!/bin/bash
# One-time setup script — run as root on the Aliyun server
set -e

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git nginx

# Install PM2
npm install -g pm2
pm2 startup systemd -u root --hp /root

# Create files directory
mkdir -p /root/files

# Clone the repo
git clone git@github.com:happyboyma/vibecoding_file_explorer.git /root/vibecoding_file_explorer

# Install server deps
cd /root/vibecoding_file_explorer
npm ci --prefix server --omit=dev

# Configure nginx
cat > /etc/nginx/sites-available/file-explorer <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 500m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/file-explorer /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "Server setup complete. Now start the app:"
echo "  ROOT_DIR=/root/files PORT=3001 HOST=0.0.0.0 pm2 start server/dist/index.js --name file-explorer"
echo "  pm2 save"
