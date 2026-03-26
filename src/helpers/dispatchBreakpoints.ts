import { Breakpoint } from 'asma-types'
import { breakpointEventBus } from 'asma-event-bus'

type Listener = () => void
const listeners = new Set<Listener>()
let current: Breakpoint = Breakpoint.Desktop

function notify(): void {
    listeners.forEach((cb) => cb())
}

breakpointEventBus.register('on_breakpoint_change', (breakpoint) => {
    if (breakpoint !== current) {
        current = breakpoint
        notify()
    }
})

export function subscribeBreakpoint(callback: Listener): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
}

export function getBreakpointSnapshot(): Breakpoint {
    return current
}

export function getBreakpointServerSnapshot(): Breakpoint {
    return Breakpoint.Desktop
}
