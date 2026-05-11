import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

// Mutation takes no input — `void` keeps the createApiMutation signature
// happy without requiring callers to pass a sentinel value.
const useFreeTrialCode = createApiMutation((_: void) => api.freeTrialCode())

export default useFreeTrialCode