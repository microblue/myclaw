import getAdminAnalytics from '@/controllers/admin/getAdminAnalytics'
import getAdminBilling from '@/controllers/admin/getAdminBilling'
import getAdminClaws from '@/controllers/admin/getAdminClaws'
import getAdminEmails from '@/controllers/admin/getAdminEmails'
import getAdminExports from '@/controllers/admin/getAdminExports'
import getAdminPendingClaws from '@/controllers/admin/getAdminPendingClaws'
import getAdminReferrals from '@/controllers/admin/getAdminReferrals'
import getAdminSSHKeys from '@/controllers/admin/getAdminSSHKeys'
import getAdminStats from '@/controllers/admin/getAdminStats'
import getAdminUsers from '@/controllers/admin/getAdminUsers'
import getAdminUserDetail from '@/controllers/admin/getAdminUserDetail'
import getAdminVolumes from '@/controllers/admin/getAdminVolumes'
import getAdminWaitlist from '@/controllers/admin/getAdminWaitlist'
import updateAdminUser from '@/controllers/admin/updateAdminUser'
import getAdminSettings from '@/controllers/admin/getAdminSettings'
import updateAdminSetting from '@/controllers/admin/updateAdminSetting'
import reassignAdminClaw from '@/controllers/admin/reassignAdminClaw'
import createActivationCodeBatch from '@/controllers/admin/createActivationCodeBatch'
import getAdminActivationCodes from '@/controllers/admin/getAdminActivationCodes'
import getAdminActivationCodeBatches from '@/controllers/admin/getAdminActivationCodeBatches'
import exportActivationCodeBatch from '@/controllers/admin/exportActivationCodeBatch'
import voidActivationCode from '@/controllers/admin/voidActivationCode'
import voidActivationCodeBatch from '@/controllers/admin/voidActivationCodeBatch'
import getAdminInstallReports from '@/controllers/admin/getAdminInstallReports'
import getAdminInstallReportDetail from '@/controllers/admin/getAdminInstallReportDetail'

export {
    getAdminAnalytics,
    getAdminBilling,
    getAdminClaws,
    getAdminEmails,
    getAdminExports,
    getAdminPendingClaws,
    getAdminReferrals,
    getAdminSSHKeys,
    getAdminStats,
    getAdminUsers,
    getAdminUserDetail,
    getAdminVolumes,
    getAdminWaitlist,
    updateAdminUser,
    getAdminSettings,
    updateAdminSetting,
    reassignAdminClaw,
    createActivationCodeBatch,
    getAdminActivationCodes,
    getAdminActivationCodeBatches,
    exportActivationCodeBatch,
    voidActivationCode,
    voidActivationCodeBatch,
    getAdminInstallReports,
    getAdminInstallReportDetail
}