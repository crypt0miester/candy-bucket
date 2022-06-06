import type { WalletProviderProps } from '@solana/wallet-adapter-react';
import { WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
    GlowWalletAdapter,
    PhantomWalletAdapter,
    SlopeWalletAdapter,
    SolflareWalletAdapter
} from '@solana/wallet-adapter-wallets';
import { useMemo } from 'react';

import('@solana/wallet-adapter-react-ui/styles.css' as any);

export function ClientWalletProvider(props: Omit<WalletProviderProps, 'wallets'>): JSX.Element {
    const wallets = useMemo(
        () => [
            new GlowWalletAdapter(),
            new PhantomWalletAdapter(),
            new SlopeWalletAdapter(),
            new SolflareWalletAdapter()
        ],
        []
    );

    return (
        <WalletProvider wallets={wallets} {...props}>
            <WalletModalProvider {...props} />
        </WalletProvider>
    );
}

export default ClientWalletProvider;
