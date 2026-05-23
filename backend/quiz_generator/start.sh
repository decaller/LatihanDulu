#!/bin/bash
# Bismillah.

echo "Starting persistent Prefect server on 0.0.0.0:4200..."
prefect server start --host 0.0.0.0 --port 4200 &

# Wait 10 seconds for Prefect server to spin up reliably
sleep 10

# Set API URL for the flow run to connect to
export PREFECT_API_URL="http://100.103.101.49:4200/api"

echo "Starting quiz generator pipeline flow..."
python generator_flow.py

echo "Quiz generator pipeline completed. Keeping Prefect server alive..."
wait
