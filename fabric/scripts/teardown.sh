#!/usr/bin/env bash
# Stop the Fabric test network and remove generated crypto/channel artifacts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NETWORK_DIR="${FABRIC_DIR}/fabric-samples/test-network"

if [ ! -d "${NETWORK_DIR}" ]; then
  echo "Nothing to tear down (missing ${NETWORK_DIR})."
  exit 0
fi

export PATH="${FABRIC_DIR}/fabric-samples/bin:${PATH}"
export FABRIC_CFG_PATH="${FABRIC_DIR}/fabric-samples/config"

cd "${NETWORK_DIR}"
./network.sh down

echo "==> Fabric test network stopped."
