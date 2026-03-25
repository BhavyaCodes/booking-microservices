#!/bin/bash

# Script to delete pods for tickets and orders deployments

set -euo pipefail

echo "Deleting pods for tickets..."
kubectl delete pods -l app=tickets

echo "Deleting pods for orders..."
kubectl delete pods -l app=orders

echo "Deleting pods for auth..."
kubectl delete pods -l app=auth

echo "Pods deletion completed."
