import type { StatusConfig } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'

const getStatusConfig = (): Record<string, StatusConfig> => {
    return {
        [clawStatus.running]: {
            color: 'bg-green-500',
            bgColor: 'bg-green-500/10',
            label: t('dashboard.status.running')
        },
        [clawStatus.stopped]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.stopped')
        },
        [clawStatus.starting]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.starting'),
            pulse: true
        },
        [clawStatus.stopping]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.stopping'),
            pulse: true
        },
        [clawStatus.creating]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.creating'),
            pulse: true
        },
        [clawStatus.configuring]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.configuring'),
            pulse: true
        },
        [clawStatus.initializing]: {
            color: 'bg-blue-500',
            bgColor: 'bg-blue-500/10',
            label: t('dashboard.status.initializing'),
            pulse: true
        },
        [clawStatus.migrating]: {
            color: 'bg-purple-500',
            bgColor: 'bg-purple-500/10',
            label: t('dashboard.status.migrating'),
            pulse: true
        },
        [clawStatus.rebuilding]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.rebuilding'),
            pulse: true
        },
        [clawStatus.restarting]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.restarting'),
            pulse: true
        },
        [clawStatus.unreachable]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.unreachable')
        },
        [clawStatus.deleting]: {
            color: 'bg-red-500',
            bgColor: 'bg-red-500/10',
            label: t('dashboard.status.deleting'),
            pulse: true
        },
        [clawStatus.awaitingPayment]: {
            color: 'bg-yellow-500',
            bgColor: 'bg-yellow-500/10',
            label: t('dashboard.status.awaitingPayment'),
            pulse: true
        },
        [clawStatus.unknown]: {
            color: 'bg-gray-400',
            bgColor: 'bg-gray-400/10',
            label: t('dashboard.status.unknown')
        }
    }
}

export default getStatusConfig