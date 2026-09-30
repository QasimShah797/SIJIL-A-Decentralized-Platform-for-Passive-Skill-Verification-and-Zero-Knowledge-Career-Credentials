#!/usr/bin/env bash
# Bring up Fabric test-network (channel sijil) and deploy CredentialAnchor chaincode.
set -euo pipefail

FABRIC_VERSION="2.5.12"
CA_VERSION="1.5.15"
CHANNEL_NAME="sijil"
CC_NAME="credentialanchor"
CC_LABEL="credentialanchor_1.0"
ISSUER_MSP="Org1MSP"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SAMPLES_DIR="${FABRIC_DIR}/fabric-samples"
NETWORK_DIR="${SAMPLES_DIR}/test-network"
CC_PATH="${FABRIC_DIR}/chaincode/credential-anchor"
INSTALL_SCRIPT="${FABRIC_DIR}/install-fabric.sh"
INSTALL_SCRIPT_URL="https://raw.githubusercontent.com/hyperledger/fabric/v${FABRIC_VERSION}/scripts/install-fabric.sh"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. In GitHub Codespaces enable the Docker-in-Docker feature." >&2
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required." >&2
  exit 1
fi

echo "==> Fabric dir: ${FABRIC_DIR}"
echo "==> Pinned Fabric ${FABRIC_VERSION} / Fabric CA ${CA_VERSION}"

cd "${FABRIC_DIR}"

if [ ! -f "${INSTALL_SCRIPT}" ]; then
  echo "==> Downloading install-fabric.sh from hyperledger/fabric v${FABRIC_VERSION}"
  curl -fsSL "${INSTALL_SCRIPT_URL}" -o "${INSTALL_SCRIPT}"
  chmod +x "${INSTALL_SCRIPT}"
fi

if [ ! -d "${SAMPLES_DIR}/test-network" ]; then
  echo "==> Installing fabric-samples, binaries, and Docker images"
  # Run from FABRIC_DIR so fabric-samples lands next to chaincode/ (not inside scripts/)
  "${INSTALL_SCRIPT}" --fabric-version "${FABRIC_VERSION}" --ca-version "${CA_VERSION}" samples binary docker
elif [ ! -x "${SAMPLES_DIR}/bin/peer" ]; then
  echo "==> fabric-samples present but peer CLI missing; installing binaries and images"
  "${INSTALL_SCRIPT}" --fabric-version "${FABRIC_VERSION}" --ca-version "${CA_VERSION}" binary docker
fi

if [ ! -d "${NETWORK_DIR}" ]; then
  echo "fabric-samples/test-network not found after install." >&2
  exit 1
fi

export PATH="${SAMPLES_DIR}/bin:${PATH}"
export FABRIC_CFG_PATH="${SAMPLES_DIR}/config"

if ! command -v peer >/dev/null 2>&1; then
  echo "peer CLI not on PATH. Expected binaries in ${SAMPLES_DIR}/bin" >&2
  exit 1
fi

echo "==> Building TypeScript chaincode"
(cd "${CC_PATH}" && npm install && npm run build)

echo "==> Starting test network (channel ${CHANNEL_NAME}, CAs enabled)"
cd "${NETWORK_DIR}"
./network.sh down || true
./network.sh up createChannel -c "${CHANNEL_NAME}" -ca

echo "==> Deploying chaincode ${CC_NAME} (${CC_LABEL})"
./network.sh deployCC \
  -c "${CHANNEL_NAME}" \
  -ccn "${CC_NAME}" \
  -ccp "${CC_PATH}" \
  -ccl typescript \
  -ccv 1.0 \
  -ccs 1

ORG1_CONN_JSON="${NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/connection-org1.json"
ORG1_CONN_YAML="${NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/connection-org1.yaml"
ORG2_CONN_JSON="${NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/connection-org2.json"
ORG2_CONN_YAML="${NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/connection-org2.yaml"

cat <<EOF

==> SIJIL Fabric test network is up

Channel:          ${CHANNEL_NAME}
Chaincode name:   ${CC_NAME}
Contract:         CredentialAnchor
Issuer MSP:       ${ISSUER_MSP} (Org1). Org2MSP cannot Anchor/Revoke.

Connection profiles (use these from a future backend client — not wired yet):
  ${ORG1_CONN_JSON}
  ${ORG1_CONN_YAML}
  ${ORG2_CONN_JSON}
  ${ORG2_CONN_YAML}

Peer TLS CA (Org1):
  ${NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt

Teardown:
  ${SCRIPT_DIR}/teardown.sh

EOF
