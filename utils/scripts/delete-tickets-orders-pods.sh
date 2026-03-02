#!/bin/bash

# Script to delete pods for tickets-depl and auth-depl deployments

echo "Deleting pods for tickets-depl..."
kubectl delete pods -l app=tickets-depl

echo "Deleting pods for auth-depl..."
kubectl delete pods -l app=auth-depl

echo "Pods deletion completed."
