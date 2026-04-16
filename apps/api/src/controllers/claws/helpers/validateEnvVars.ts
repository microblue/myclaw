import { inputValidation } from '@openclaw/shared'

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/

const validateEnvVars = (envVars: Record<string, string>): boolean => {
    for (const key of Object.keys(envVars)) {
        if (!ENV_KEY_REGEX.test(key)) return false
        if (key.length > inputValidation.ENV_VAR_KEY.MAX) return false
        if (typeof envVars[key] !== 'string') return false
        if (envVars[key].length > inputValidation.ENV_VAR_VALUE.MAX)
            return false
    }
    return true
}

export default validateEnvVars