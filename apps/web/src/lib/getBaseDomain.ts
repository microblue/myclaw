const getBaseDomain = (): string => {
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1')
        return 'myclaw.one'
    return hostname
}

export default getBaseDomain