import { Connection, Keypair } from '@solana/web3.js';
import React, { useContext, useEffect, useMemo, useState } from 'react';

type UseStorageReturnValue = {
    getItem: (key: string) => string;
    setItem: (key: string, value: string) => boolean;
    removeItem: (key: string) => void;
};

export const useLocalStorage = (): UseStorageReturnValue => {
    const isBrowser: boolean = ((): boolean => typeof window !== 'undefined')();

    const getItem = (key: string): string => {
        return isBrowser ? window.localStorage[key] : '';
    };

    const setItem = (key: string, value: string): boolean => {
        if (isBrowser) {
            window.localStorage.setItem(key, value);
            return true;
        }

        return false;
    };

    const removeItem = (key: string): void => {
        window.localStorage.removeItem(key);
    };

    return {
        getItem,
        setItem,
        removeItem
    };
};

export type ENV = 'mainnet-beta' | 'testnet' | 'devnet' | 'localnet';

export const ENDPOINTS = [
    {
        name: 'mainnet-beta' as ENV,
        endpoint: 'https://ssc-dao.genesysgo.net'
    },
    {
        name: 'devnet' as ENV,
        endpoint: 'https://api.devnet.solana.com/'
    }
];

const DEFAULT = ENDPOINTS[0].endpoint;

interface ConnectionConfig {
    connection: Connection;
    endpoint: string;
    env: ENV;
    setEndpoint: (val: string) => void;
}

const ConnectionContext = React.createContext<ConnectionConfig>({
    endpoint: DEFAULT,
    setEndpoint: () => {},
    connection: new Connection(DEFAULT, 'recent'),
    env: ENDPOINTS[0].name
});

export function ConnectionProviderCB({ children = undefined }: { children: React.ReactNode }) {
    const [endpoint, setEndpoint] = useState(ENDPOINTS[0].endpoint);

    const connection = useMemo(() => new Connection(endpoint, 'recent'), [endpoint]);

    const env = ENDPOINTS.find((end) => end.endpoint === endpoint)?.name || ENDPOINTS[0].name;

    // The websocket library solana/web3.js uses closes its websocket connection when the subscription list
    // is empty after opening its first time, preventing subsequent subscriptions from receiving responses.
    // This is a hack to prevent the list from every getting empty
    useEffect(() => {
        const id = connection.onAccountChange(Keypair.generate().publicKey, () => {});
        return () => {
            connection.removeAccountChangeListener(id);
        };
    }, [connection]);

    useEffect(() => {
        const id = connection.onSlotChange(() => null);
        return () => {
            connection.removeSlotChangeListener(id);
        };
    }, [connection]);

    return (
        <ConnectionContext.Provider
            value={{
                endpoint,
                setEndpoint,
                connection,
                env
            }}
        >
            {children}
        </ConnectionContext.Provider>
    );
}

export function useConnection() {
    return useContext(ConnectionContext).connection as Connection;
}

export function useConnectionConfig() {
    const context = useContext(ConnectionContext);
    return {
        endpoint: context.endpoint,
        setEndpoint: context.setEndpoint,
        env: context.env
    };
}
