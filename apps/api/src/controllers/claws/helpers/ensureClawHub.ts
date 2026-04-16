import executeSSH from '@/services/ssh'

const INSTALL_CMD = 'npm install -g clawhub@latest >/dev/null 2>&1'

const CHECK_AND_UPDATE = [
    'if ! command -v clawhub >/dev/null 2>&1; then',
    `  ${INSTALL_CMD};`,
    'else',
    '  CV=$(clawhub --version 2>/dev/null || echo "0.0.0");',
    '  LV=$(npm view clawhub version 2>/dev/null || echo "0.0.0");',
    '  if [ "$CV" != "$LV" ]; then',
    `    ${INSTALL_CMD};`,
    '  fi;',
    'fi'
].join(' ')

const ensureClawHub = async (ip: string, password: string): Promise<void> => {
    await executeSSH(ip, password, CHECK_AND_UPDATE, 60000)
}

export default ensureClawHub