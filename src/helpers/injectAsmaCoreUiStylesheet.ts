export function injectShell__asmaCoreUiStylesheet(env: string): void {
    const asmaCoreUiStyleSheet = document.getElementById('asma-core-ui-stylesheet') as HTMLLinkElement
    if (!asmaCoreUiStyleSheet) return
    const isProd = env === 'prod' && asmaCoreUiStyleSheet.href.includes('prod')
    if (isProd) return
    const isDev = env === 'dev' || env === 'localhost'
    const version = isDev ? 'latest' : env
    asmaCoreUiStyleSheet.href = `https://www.unpkg.com/asma-core-ui@${version}/dist/style.css`
}

export function injectMfe__asmaCoreUiStylesheet(env: string): void {
    const asmaCoreUiStyleSheet = document.getElementById('asma-core-ui-stylesheet')
    if (!asmaCoreUiStyleSheet) {
        const head = document.getElementsByTagName('head')[0]
        const newCoreUiStyleSheet = document.createElement('link')
        newCoreUiStyleSheet.type = 'text/css'
        newCoreUiStyleSheet.rel = 'stylesheet'
        newCoreUiStyleSheet.setAttribute('id', 'asma-core-ui-stylesheet')
        const isDev = env === 'dev' || env === 'localhost'
        const version = isDev ? 'latest' : env
        newCoreUiStyleSheet.href = `https://www.unpkg.com/asma-core-ui@${version}/dist/style.css`
        head && head.prepend(newCoreUiStyleSheet)
    }
}
