export function injectShell__asmaCoreUiStylesheet(stage: string): void {
    const asmaCoreUiStyleSheet = document.getElementById('asma-core-ui-stylesheet') as HTMLLinkElement
    if (!asmaCoreUiStyleSheet) return
    const isProd = stage === 'prod' && asmaCoreUiStyleSheet.href.includes('prod')
    if (isProd) return
    const isDev = stage === 'dev' || stage === 'localhost'
    const version = isDev ? 'latest' : stage
    asmaCoreUiStyleSheet.href = `https://www.unpkg.com/asma-core-ui@${version}/dist/style.css`
}
