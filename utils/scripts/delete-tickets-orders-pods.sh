#!/bin/bash

# Script to delete pods for tickets and orders deployments

set -euo pipefail

echo "Deleting pods for tickets..."
kubectl delete pods -l app=tickets

echo "Deleting pods for orders..."
kubectl delete pods -l app=orders

echo "Pods deletion completed."
