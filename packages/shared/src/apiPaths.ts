const API_PATHS = {
    AUTH: {
        SEND_OTP: '/auth/send-otp',
        VERIFY_OTP: '/auth/verify-otp',
        RESOLVE_CONFLICT: '/auth/resolve-credential-conflict'
    },
    PLANS: {
        BASE: '/plans',
        LOCATIONS: '/plans/locations',
        VOLUME_PRICING: '/plans/volume-pricing',
        AVAILABILITY: '/plans/availability'
    },
    PROVIDERS: {
        BASE: '/providers',
        byId: (id: string) => `/providers/${id}`,
        PLANS: (id: string) => `/providers/${id}/plans`,
        CURATED_PLANS: (id: string) => `/providers/${id}/curated-plans`,
        LOCATIONS: (id: string) => `/providers/${id}/locations`,
        AVAILABILITY: (id: string) => `/providers/${id}/availability`,
        VOLUME_PRICING: (id: string) => `/providers/${id}/volume-pricing`
    },
    CLAWS: {
        BASE: '/claws',
        ADMIN: '/claws/admin',
        PURCHASE: '/claws/purchase',
        SUGGEST_NAME: '/claws/suggest-name',
        ACTIVATION_CODE_PREVIEW: '/claws/activation-code/preview',
        byId: (id: string) => `/claws/${id}`,
        PENDING: (id: string) => `/claws/pending/${id}`,
        SYNC: (id: string) => `/claws/${id}/sync`,
        START: (id: string) => `/claws/${id}/start`,
        STOP: (id: string) => `/claws/${id}/stop`,
        RESTART: (id: string) => `/claws/${id}/restart`,
        CANCEL_DELETION: (id: string) => `/claws/${id}/cancel-deletion`,
        HARD_DELETE: (id: string) => `/claws/${id}/hard-delete`,
        SUBDOMAIN: (id: string) => `/claws/${id}/subdomain`,
        REINSTALL: (id: string) => `/claws/${id}/reinstall`,
        CREDENTIALS: (id: string) => `/claws/${id}/credentials`,
        ENV: (id: string) => `/claws/${id}/env`,
        EXPORT: (id: string) => `/claws/${id}/export`,
        DIAGNOSTICS: {
            STATUS: (id: string) => `/claws/${id}/diagnostics/status`,
            LOGS: (id: string) => `/claws/${id}/diagnostics/logs`,
            BOOTSTRAP_LOG: (id: string) =>
                `/claws/${id}/diagnostics/bootstrap-log`,
            REPAIR: (id: string) => `/claws/${id}/diagnostics/repair`
        },
        METRICS: (id: string) => `/claws/${id}/metrics`,
        VERSION: (id: string) => `/claws/${id}/version`,
        VERSIONS: (id: string) => `/claws/${id}/versions`,
        INSTALL_VERSION: (id: string) => `/claws/${id}/install-version`,
        AGENTS: {
            BASE: (id: string) => `/claws/${id}/agents`,
            CREATE: (id: string) => `/claws/${id}/agents/create`,
            DELETE: (id: string) => `/claws/${id}/agents/delete`,
            CONFIG: (id: string) => `/claws/${id}/agent-config`,
            SKILLS: (clawId: string, agentId: string) =>
                `/claws/${clawId}/agents/${agentId}/skills`
        },
        CHANNELS: {
            BASE: (id: string) => `/claws/${id}/channels`,
            WHATSAPP_PAIR: (id: string) =>
                `/claws/${id}/channels/whatsapp/pair`,
            WHATSAPP_PAIR_STATUS: (id: string) =>
                `/claws/${id}/channels/whatsapp/pair-status`
        },
        BINDINGS: (id: string) => `/claws/${id}/bindings`,
        SKILLS: (id: string) => `/claws/${id}/skills`,
        FILES: {
            BASE: (id: string) => `/claws/${id}/files`,
            READ: (id: string) => `/claws/${id}/files/read`
        },
        CLAWHUB: {
            SKILLS: (id: string) => `/claws/${id}/clawhub/skills`,
            INSTALLED: (id: string) => `/claws/${id}/clawhub/installed`,
            INSTALL: (id: string) => `/claws/${id}/clawhub/install`,
            REMOVE: (id: string) => `/claws/${id}/clawhub/remove`,
            UPDATE: (id: string) => `/claws/${id}/clawhub/update`,
            UPDATES: (id: string) => `/claws/${id}/clawhub/updates`
        }
    },
    AFFILIATE: {
        BASE: '/affiliate',
        GENERATE: '/affiliate/generate',
        CODE: '/affiliate/code'
    },
    USERS: {
        ME: '/users/me',
        STATS: '/users/me/stats',
        BILLING: '/users/me/billing',
        BILLING_PORTAL: '/users/me/billing/portal',
        LICENSE_CHECKOUT: '/users/me/license/checkout',
        ORDER_INVOICE: (orderId: string) =>
            `/users/me/billing/${orderId}/invoice`,
        AUTH_METHOD: (method: string) => `/users/me/auth/${method}`
    },
    AI: {
        TTS: '/ai/tts',
        VOICES: '/ai/voices'
    },
    WAITLIST: {
        BASE: '/waitlist',
        STATUS: '/waitlist/status'
    },
    ADMIN: {
        USERS: '/admin/users',
        USER: (id: string) => `/admin/users/${id}`,
        UPDATE_USER: (id: string) => `/admin/users/${id}`,
        STATS: '/admin/stats',
        ANALYTICS: '/admin/analytics',
        BILLING: '/admin/billing',
        CLAWS: '/admin/claws',
        REASSIGN_CLAW_OWNER: (id: string) => `/admin/claws/${id}/owner`,
        PENDING_CLAWS: '/admin/pending-claws',
        SSH_KEYS: '/admin/ssh-keys',
        VOLUMES: '/admin/volumes',
        REFERRALS: '/admin/referrals',
        WAITLIST: '/admin/waitlist',
        EXPORTS: '/admin/exports',
        EMAILS: '/admin/emails',
        SETTINGS: '/admin/settings',
        UPDATE_SETTING: (key: string) => `/admin/settings/${key}`,
        ACTIVATION_CODES: '/admin/activation-codes',
        ACTIVATION_CODE_BATCHES: '/admin/activation-codes/batches',
        ACTIVATION_CODE_BATCH_EXPORT: (batchId: string) =>
            `/admin/activation-codes/batches/${batchId}/export`,
        VOID_ACTIVATION_CODE_BATCH: (batchId: string) =>
            `/admin/activation-codes/batches/${batchId}/void-unused`,
        VOID_ACTIVATION_CODE: (id: string) =>
            `/admin/activation-codes/${id}/void`,
        INSTALL_REPORTS: '/admin/install-reports',
        INSTALL_REPORT: (id: string) => `/admin/install-reports/${id}`,
        PARTNERS: '/admin/partners',
        UPDATE_PARTNER_STATUS: (id: string) => `/admin/partners/${id}/status`,
        GRANT_PARTNER_QUOTA: (id: string) => `/admin/partners/${id}/quotas`
    },
    // Channel-partner self-serve surface. Backed by the same controllers
    // as ADMIN.* but mounted under /partner with partnerOrSuperAdmin gate
    // and per-partner row scoping.
    PARTNER: {
        ACTIVATION_CODES: '/partner/activation-codes',
        ACTIVATION_CODE_BATCHES: '/partner/activation-codes/batches',
        ACTIVATION_CODE_BATCH_EXPORT: (batchId: string) =>
            `/partner/activation-codes/batches/${batchId}/export`,
        VOID_ACTIVATION_CODE_BATCH: (batchId: string) =>
            `/partner/activation-codes/batches/${batchId}/void-unused`,
        VOID_ACTIVATION_CODE: (id: string) =>
            `/partner/activation-codes/${id}/void`
    },
    WEBHOOKS: {
        POLAR: '/webhooks/polar'
    },
    INSTALL_REPORTS: '/install-reports'
} as const

export default API_PATHS