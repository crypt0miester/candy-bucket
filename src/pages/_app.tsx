import 'tailwindcss/tailwind.css';
import '../styles/globals.css';
import '../styles/App.css';

import { ConnectionProviderCB } from 'contexts/connection-context-provider';
import type { AppProps } from 'next/app';
import dynamic from 'next/dynamic';
import React from 'react';

// set custom RPC server endpoint for the final website
// const endpoint = "https://explorer-api.devnet.solana.com";
// const endpoint = "http://127.0.0.1:8899";
// const endpoint = 'https://api.devnet.solana.com';
// export const ENDPOINT = 'https://ssc-dao.genesysgo.net'

const WalletProvider = dynamic(() => import('../contexts/client-wallet-provider'), {
    ssr: false
});

function MyApp({ Component, pageProps }: AppProps) {
    return (
        <ConnectionProviderCB>
            <WalletProvider>
                <Component {...pageProps} />
            </WalletProvider>
        </ConnectionProviderCB>
    );
}

export default MyApp;
