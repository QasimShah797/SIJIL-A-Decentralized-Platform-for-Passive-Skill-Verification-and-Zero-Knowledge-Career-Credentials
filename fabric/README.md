# SIJIL Fabric test network (step 3)

Local Hyperledger Fabric **2.5.12** test network plus TypeScript chaincode that stores opaque credential hashes. **Nothing in the SIJIL app calls this yet.**

Anchors contain only `credentialId`, `hash`, `issuerDid`, `holderDid`, `issuedAt`, `status`, `revokedAt`, and `revocationReason`. No names, emails, or evidence payloads.

## Prerequisites

- Docker Engine (Compose v2) with permission to run containers
- Git, curl, Node.js 18+ (for chaincode `npm install` / `npm run build`)
- ~4 GB RAM free; Docker images are several GB on first pull

On **Windows**, run the scripts from GitHub Codespaces, WSL2, or Git Bash — they are bash, not PowerShell.

### GitHub Codespaces

1. Create a Codespace from this repo (Linux + Docker-in-Docker).
2. If `docker ps` fails, add the Docker-in-Docker feature or rebuild with Docker enabled.
3. From the repo root:

```bash
chmod +x fabric/scripts/setup.sh fabric/scripts/teardown.sh
./fabric/scripts/setup.sh
```

First run downloads `fabric-samples`, peer/orderer binaries, and Hyperledger images. Later runs reuse `fabric/fabric-samples/` (gitignored).

Tear down:

```bash
./fabric/scripts/teardown.sh
```

## What setup does

1. Downloads [install-fabric.sh](https://raw.githubusercontent.com/hyperledger/fabric/v2.5.12/scripts/install-fabric.sh) pinned to **Fabric 2.5.12** and **Fabric CA 1.5.15**.
2. Installs samples, binaries, and Docker images under `fabric/`.
3. Builds `fabric/chaincode/credential-anchor`.
4. Runs `./network.sh up createChannel -c sijil -ca`.
5. Deploys chaincode `credentialanchor` (contract **CredentialAnchor**) with `./network.sh deployCC`.
6. Prints Org1/Org2 connection profile paths for a future backend client.

**Issuer MSP** on this network is `Org1MSP`. `AnchorCredential` and `RevokeCredential` reject other MSPs (e.g. `Org2MSP`).

## Chaincode unit tests (no Docker)

```bash
cd fabric/chaincode/credential-anchor
npm install
npm test
```

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| `docker: permission denied` | Codespaces: Docker-in-Docker feature. Linux: add user to `docker` group and re-login. |
| `peer` not found | `export PATH="$PWD/fabric/fabric-samples/bin:$PATH"` from repo root after a successful install. |
| `network.sh up` fails / port in use | `./fabric/scripts/teardown.sh` then retry. Stop other stacks on 7050/7051/9051. |
| Chaincode deploy timeout | Increase Docker memory (8 GB+). Retry `deployCC` after `network.sh down` / `up`. |
| `fabric-samples v2.5.12 does not exist` | The installer falls back to `fabric-samples` **main**. Still pin binaries with `-f 2.5.12`. |
| Images pull slowly | Codespaces in a closer region; avoid VPN if Docker Hub is throttled. |
| Stale chaincode | `./network.sh down` then `setup.sh` again, or bump sequence (`-ccs`) if you redeploy by hand. |

Downloaded artifacts stay out of git (`fabric/fabric-samples/`, binaries, `node_modules`, `dist`). Commit only `fabric/chaincode/**` source, `fabric/scripts/**`, and this README.
