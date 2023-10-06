export const injectAsmaCoreUiStyles = () => {
    const asmaCoreUiStyleSheet = document.getElementById('asma-core-ui-stylesheet')
    if (!asmaCoreUiStyleSheet) {
        const head = document.getElementsByTagName('head')[0]
        const newCoreUiStyleSheet = document.createElement('link')
        newCoreUiStyleSheet.type = 'text/css'
        newCoreUiStyleSheet.rel = 'stylesheet'
        newCoreUiStyleSheet.setAttribute('id', 'asma-core-ui-stylesheet')
        newCoreUiStyleSheet.href = 'https://www.unpkg.com/asma-core-ui/dist/style.css'
        head && head.prepend(newCoreUiStyleSheet)
    }
}
