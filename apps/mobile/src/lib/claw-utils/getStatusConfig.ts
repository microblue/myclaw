import type { StatusConfig } from '@/ts/Interfaces'

import { t } from '@openclaw/i18n'
import { clawStatus } from '@openclaw/shared'
import { COLORS } from '@/lib/theme'

const getStatusConfig = (): Record<string, StatusConfig> => {
    return {
        [clawStatus.running]: {
            color: COLORS.statusRunning,
            bgColor: COLORS.statusRunningBg,
            label: t('dashboard.status.running')
        },
        [clawStatus.stopped]: {
            color: COLORS.statusStopped,
            bgColor: COLORS.statusStoppedBg,
            label: t('dashboard.status.stopped')
        },
        [clawStatus.starting]: {
            color: COLORS.statusStarting,
            bgColor: COLORS.statusStartingBg,
            label: t('dashboard.status.starting'),
            pulse: true
        },
        [clawStatus.stopping]: {
            color: COLORS.statusStarting,
            bgColor: COLORS.statusStartingBg,
            label: t('dashboard.status.stopping'),
            pulse: true
        },
        [clawStatus.creating]: {
            color: COLORS.statusCreating,
            bgColor: COLORS.statusCreatingBg,
            label: t('dashboard.status.creating'),
            pulse: true
        },
        [clawStatus.configuring]: {
            color: COLORS.statusCreating,
            bgColor: COLORS.statusCreatingBg,
            label: t('dashboard.status.configuring'),
            pulse: true
        },
        [clawStatus.initializing]: {
            color: COLORS.statusCreating,
            bgColor: COLORS.statusCreatingBg,
            label: t('dashboard.status.initializing'),
            pulse: true
        },
        [clawStatus.migrating]: {
            color: COLORS.statusMigrating,
            bgColor: COLORS.statusMigratingBg,
            label: t('dashboard.status.migrating'),
            pulse: true
        },
        [clawStatus.rebuilding]: {
            color: COLORS.statusRebuilding,
            bgColor: COLORS.statusRebuildingBg,
            label: t('dashboard.status.rebuilding'),
            pulse: true
        },
        [clawStatus.restarting]: {
            color: COLORS.statusStarting,
            bgColor: COLORS.statusStartingBg,
            label: t('dashboard.status.restarting'),
            pulse: true
        },
        [clawStatus.unreachable]: {
            color: COLORS.statusDeleting,
            bgColor: COLORS.statusDeletingBg,
            label: t('dashboard.status.unreachable')
        },
        [clawStatus.deleting]: {
            color: COLORS.statusDeleting,
            bgColor: COLORS.statusDeletingBg,
            label: t('dashboard.status.deleting'),
            pulse: true
        },
        [clawStatus.unknown]: {
            color: COLORS.statusStopped,
            bgColor: COLORS.statusStoppedBg,
            label: t('dashboard.status.unknown')
        }
    }
}

export default getStatusConfig