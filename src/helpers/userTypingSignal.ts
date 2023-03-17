/* @__PURE__ */
export function userTypingSignal(insertUserLastTyped: () => Promise<unknown>) {
    let timmer: number | undefined = undefined

    let last_typed: number | undefined = undefined

    function setLastTyped() {
        last_typed = Date.now()
    }

    function initiateUserTyping() {
        if (timmer) {
            return
        }

        if (userIsTyping()) {
            timmer = window.setInterval(() => {
                if (!userIsTyping()) {
                    window.clearInterval(timmer)

                    timmer = undefined
                    return
                }

                insertUserLastTyped()
            }, 1600)
        }
    }
    function userIsTyping() {
        if (!last_typed) {
            return false
        }

        return last_typed > Date.now() - 2 * 1000
    }

    return {
        initiateUserTyping,

        setLastTyped,
    }
}
