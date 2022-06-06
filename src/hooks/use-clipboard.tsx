import copy from 'copy-to-clipboard';
import { useEffect, useState } from 'react';

interface IOptions {
    successDuration?: number;
}

export default function useCopyClipboard(text: string, options?: IOptions): [boolean, () => void] {
    const [isCopied, setIsCopied] = useState(false);
    const successDuration = options && options.successDuration;

    useEffect(() => {
        if (isCopied && successDuration) {
            const id = setTimeout(() => {
                setIsCopied(false);
            }, successDuration);

            return () => {
                clearTimeout(id);
            };
        }
    }, [isCopied, successDuration]);

    return [
        isCopied,
        () => {
            const didCopy = copy(text);
            setIsCopied(didCopy);
        }
    ];
}
