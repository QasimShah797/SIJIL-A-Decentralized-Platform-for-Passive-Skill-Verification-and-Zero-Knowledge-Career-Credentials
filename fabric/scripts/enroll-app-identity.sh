#!/usr/bin/env bash
# Enroll a least-privilege Org1 application identity for SIJIL.
# Does not rotate Admin, does not submit credentials, and does not run unless
# ENROLL_APP_IDENTITY=approve is set in the environment for this command.
set -euo pipefail

if [[ "${ENROLL_APP_IDENTITY:-}" != "approve" ]]; then
  echo "Refusing to enroll. Re-run only after approval:"
  echo "  ENROLL_APP_IDENTITY=approve ./fabric/scripts/enroll-app-identity.sh"
  echo "This creates users sijil-app (writes) under Org1. It does not replace Admin."
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="${ROOT}/fabric/fabric-samples/bin"
CA_HOME="${ROOT}/fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com"
FABRIC_CA_CLIENT="${BIN}/fabric-ca-client"

if [[ ! -x "${FABRIC_CA_CLIENT}" ]]; then
  echo "fabric-ca-client is not installed. Run fabric/scripts/setup.sh on an isolated network first."
  exit 2
fi

export FABRIC_CA_CLIENT_HOME="${CA_HOME}"
export PATH="${BIN}:${PATH}"

echo "Enrolling sijil-app with Org1 CA. Admin credentials are not modified."
"${FABRIC_CA_CLIENT}" register \
  --id.name sijil-app \
  --id.secret sijil-app-pw \
  --id.type client \
  --tls.certfiles "${CA_HOME}/ca/ca.org1.example.com-cert.pem" \
  --url https://localhost:7054 \
  || echo "Register skipped if sijil-app already exists."

"${FABRIC_CA_CLIENT}" enroll \
  -u https://sijil-app:sijil-app-pw@localhost:7054 \
  --tls.certfiles "${CA_HOME}/ca/ca.org1.example.com-cert.pem" \
  -M "${CA_HOME}/users/sijil-app@org1.example.com/msp"

echo "Point FABRIC_CERT_PATH and FABRIC_KEY_PATH at users/sijil-app@org1.example.com."
echo "Keep FABRIC_ENABLED=false until the chaincode upgrade to version 1.1.0 is approved."
echo "Chaincode 1.1.0 accepts writes only from CN=sijil-app (or attribute sijil.role=anchor)."
