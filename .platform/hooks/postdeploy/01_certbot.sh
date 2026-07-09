#!/bin/bash
if ! command -v certbot &> /dev/null; then
    dnf install -y certbot python3-certbot-nginx || yum install -y certbot python3-certbot-nginx
fi
certbot --nginx -d avgcians.com -d www.avgcians.com --non-interactive --agree-tos -m your-email@example.com --redirect