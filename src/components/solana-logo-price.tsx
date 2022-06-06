import Image from 'next/image';

import { imageLoader } from '../utils/image-loader';

export function SolanaLogoPrice() {
    return (
        <Image
            loader={imageLoader}
            src="/images/icons/sol-logo.png"
            alt="logo"
            className="my-auto"
            style={{
                width: '32px',
                height: '32px',
                marginLeft: '5px',
                marginRight: '7px',
                alignItems: 'center',
                flexShrink: 0,
                lineHeight: 1,
                userSelect: 'none',
                borderRadius: '50%',
                justifyContent: 'center'
            }}
        />
    );
}
