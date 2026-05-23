#!/bin/bash

# ============================================================
# latihandulu production deployment script
# ============================================================

set -e

echo "=== Starting Production Deployment ==="

# 1. Load environment variables from .env
if [ -f .env ]; then
  echo "Loading environment variables from .env..."
  # Export non-comment lines
  export $(grep -v '^#' .env | xargs)
else
  echo "Error: .env file not found!"
  exit 1
fi

# Determine SSH Host
SSH_USER="root"
SSH_PASS="${PROD_SERVER_PASS}"

if [ -z "${SSH_PASS}" ]; then
  echo "Error: PROD_SERVER_PASS is not defined in .env!"
  exit 1
fi

# Pick reachable IP
echo "Detecting reachable production server IP..."
if ping -c 1 -W 2 "${PROD_SERVER_IP_TAILSCALE}" >/dev/null 2>&1; then
  SSH_HOST="${PROD_SERVER_IP_TAILSCALE}"
  echo "Using Tailscale IP: ${SSH_HOST}"
elif ping -c 1 -W 2 "${PROD_SERVER_IP}" >/dev/null 2>&1; then
  SSH_HOST="${PROD_SERVER_IP}"
  echo "Using local IP: ${SSH_HOST}"
else
  echo "Error: Could not reach production server at ${PROD_SERVER_IP_TAILSCALE} or ${PROD_SERVER_IP}!"
  exit 1
fi

# 2. Rebuild the application locally
echo "Building the application locally with bun..."
bun run build

# 3. Package the required files
echo "Packaging files into deploy.tar.gz..."
tar -czf deploy.tar.gz .output backend/data.db backend/quiz_generator .env Dockerfile docker-compose.yml

# 4. Upload the package using sshpass and scp
echo "Uploading package to remote server..."
sshpass -p "${SSH_PASS}" scp -o StrictHostKeyChecking=no deploy.tar.gz ${SSH_USER}@${SSH_HOST}:/root/

# 5. Extract and deploy remotely using sshpass and ssh
echo "Executing remote deployment steps..."
sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${SSH_HOST} "bash -s" << 'EOF'
  set -e
  echo "--- Remote server execution ---"
  
  # Ensure app directory exists
  mkdir -p /root/app
  
  # Extract files into the app directory
  echo "Extracting deployment archive..."
  tar -xzf /root/deploy.tar.gz -C /root/app
  
  # Clean up the remote tarball
  rm -f /root/deploy.tar.gz
  
  # Run docker compose
  cd /root/app
  echo "Stopping existing containers..."
  docker compose down || true
  
  echo "Building and starting new production containers..."
  docker compose up --build -d
  
  echo "Stopping existing quiz generator daemon on production if running..."
  docker stop quiz-generator-daemon || true
  docker rm quiz-generator-daemon || true
  
  echo "Starting quiz generator daemon on production in background..."
  cd /root/app/backend/quiz_generator
  docker compose run --build -d --name quiz-generator-daemon generator python generator_flow.py
  
  echo "Verifying running containers:"
  cd /root/app
  docker compose ps
  docker ps | grep quiz-generator-daemon || true
  
  echo "--- Remote deployment completed successfully ---"
EOF

# 6. Local Clean Up
echo "Cleaning up local temporary files..."
rm -f deploy.tar.gz

echo "=== Alhamdulillah! Deployment completed successfully ==="
