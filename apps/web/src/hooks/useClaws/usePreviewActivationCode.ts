import { api } from '@/lib'
import createApiMutation from '@/hooks/createApiMutation'

const usePreviewActivationCode = createApiMutation((code: string) =>
    api.previewActivationCode(code)
)

export default usePreviewActivationCode