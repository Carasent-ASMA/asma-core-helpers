import { useState, useEffect } from 'react';
export function useWindowWidthSize() {
    const [windowWidthSize, setWindowWidthSize] = useState(undefined);
    useEffect(() => {
        const handleResize = () => setWindowWidthSize(window.innerWidth);
        window.addEventListener('resize', handleResize);
        handleResize();
        // Remove event listener on cleanup
        return () => window.removeEventListener('resize', handleResize);
    }, [window.innerWidth]);
    return windowWidthSize;
}
//# sourceMappingURL=useWindowWidthSise.hook.js.map