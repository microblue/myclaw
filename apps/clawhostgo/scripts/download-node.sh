#!/bin/bash
set -euo pipefail

NODE_VERSION="22.16.0"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/resources/node"

detect_platform() {
    local os arch
    case "$(uname -s)" in
        Darwin) os="darwin" ;;
        Linux)  os="linux" ;;
        *)      echo "Unsupported OS: $(uname -s)" && exit 1 ;;
    esac
    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *)             echo "Unsupported arch: $(uname -m)" && exit 1 ;;
    esac
    echo "${os}-${arch}"
}

PLATFORM=$(detect_platform)
TARBALL="node-v${NODE_VERSION}-${PLATFORM}.tar.gz"
URL="https://nodejs.org/dist/v${NODE_VERSION}/${TARBALL}"
TMP_DIR=$(mktemp -d)

echo "Downloading Node.js v${NODE_VERSION} for ${PLATFORM}..."
curl -fsSL "${URL}" -o "${TMP_DIR}/${TARBALL}"

echo "Extracting..."
tar -xzf "${TMP_DIR}/${TARBALL}" -C "${TMP_DIR}"

EXTRACTED="${TMP_DIR}/node-v${NODE_VERSION}-${PLATFORM}"

rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}/bin"

cp "${EXTRACTED}/bin/node" "${OUTPUT_DIR}/bin/node"
cp -r "${EXTRACTED}/lib/node_modules/npm" "${OUTPUT_DIR}/bin/npm-pkg"

cat > "${OUTPUT_DIR}/bin/npm" << 'NPMSCRIPT'
#!/bin/sh
basedir=$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")
exec "$basedir/node" "$basedir/npm-pkg/bin/npm-cli.js" "$@"
NPMSCRIPT
chmod +x "${OUTPUT_DIR}/bin/npm"
chmod +x "${OUTPUT_DIR}/bin/node"

rm -rf "${TMP_DIR}"

echo "Node.js v${NODE_VERSION} installed to ${OUTPUT_DIR}"
echo "  node: ${OUTPUT_DIR}/bin/node"
echo "  npm:  ${OUTPUT_DIR}/bin/npm"