import { useWallet } from '@solana/wallet-adapter-react';
import {
    useWalletModal,
    WalletConnectButton,
    WalletIcon,
    WalletModalButton
} from '@solana/wallet-adapter-react-ui';
import Image from 'next/image';
import { imageLoader } from '../utils/image-loader';
import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CSSProperties, MouseEvent, ReactElement } from 'react';

import { ENDPOINTS, useConnectionConfig } from '../contexts/connection-context-provider';

interface ButtonProps {
    className?: string;
    disabled?: boolean;
    endIcon?: ReactElement;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    startIcon?: ReactElement;
    style?: CSSProperties;
    tabIndex?: number;
    children?: React.ReactNode;
}

const Button: FC<ButtonProps> = (props) => {
    return (
        <button
            className={`wallet-adapter-button ${props.className || ''}`}
            disabled={props.disabled}
            onClick={props.onClick}
            tabIndex={props.tabIndex || 0}
            type="button"
        >
            {props.startIcon && (
                <i className="wallet-adapter-button-start-icon">{props.startIcon}</i>
            )}
            {props.children}
            {props.endIcon && <i className="wallet-adapter-button-end-icon">{props.endIcon}</i>}
        </button>
    );
};

export const WalletMultiButtonCB: FC<ButtonProps> = ({ children, ...props }) => {
    const { publicKey, wallet, disconnect } = useWallet();
    const { setVisible } = useWalletModal();
    const { setEndpoint, env } = useConnectionConfig();
    const [copied, setCopied] = useState(false);
    const [active, setActive] = useState(false);
    const ref = useRef<HTMLUListElement>(null);

    const base58 = useMemo(() => publicKey?.toBase58(), [publicKey]);
    const content = useMemo(() => {
        if (children) return children;
        if (!wallet || !base58) return null;
        return base58.slice(0, 4) + '..' + base58.slice(-4);
    }, [children, wallet, base58]);

    const solscanAccountUrl = (publicKey: string) => {
        if (env === 'mainnet-beta') {
            return `https://solscan.io/account/${publicKey}`;
        } else {
            return `https://solscan.io/account/${publicKey}?cluster=devnet`;
        }
    };

    const solExplorerAccountUrl = (publicKey: string) => {
        if (env === 'mainnet-beta') {
            return `https://explorer.solana.com/account/${publicKey}`;
        } else {
            return `https://explorer.solana.com/account/${publicKey}?cluster=devnet`;
        }
    };

    const copyAddress = useCallback(async () => {
        if (base58) {
            await navigator.clipboard.writeText(base58);
            setCopied(true);
            setTimeout(() => setCopied(false), 400);
        }
    }, [base58]);

    const openDropdown = useCallback(() => {
        setActive(true);
    }, []);

    const closeDropdown = useCallback(() => {
        setActive(false);
    }, []);

    const openModal = useCallback(() => {
        setVisible(true);
        closeDropdown();
    }, [closeDropdown]);

    useEffect(() => {
        const listener = (event: MouseEvent | TouchEvent) => {
            const node = ref.current;

            // Do nothing if clicking dropdown or its descendants
            if (!node || node.contains(event.target as Node)) return;

            closeDropdown();
        };
        // @ts-ignore
        document.addEventListener('mouseup', listener);
        document.addEventListener('touchstart', listener);

        return () => {
            // @ts-ignore
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [ref, closeDropdown]);

    if (!wallet) return <WalletModalButton {...props}>{children}</WalletModalButton>;
    if (!base58) return <WalletConnectButton {...props}>{children}</WalletConnectButton>;

    return (
        <div className="wallet-adapter-dropdown">
            <Button
                aria-expanded={active}
                className="wallet-adapter-button-trigger"
                style={{ pointerEvents: active ? 'none' : 'auto', ...props.style }}
                onClick={openDropdown}
                startIcon={<WalletIcon wallet={wallet} />}
                {...props}
            >
                {content}
            </Button>
            <ul
                aria-label="dropdown-list"
                className={`wallet-adapter-dropdown-list 
                ${active && 'wallet-adapter-dropdown-list-active'}`}
                ref={ref}
                role="menu"
            >
                <li
                    className="wallet-adapter-dropdown-list-item pointer-events-none bg-[#512da8]"
                    style={{
                        fontSize: '15px',
                        color: 'white'
                    }}
                    role="menuitem"
                >
                    <div className="grid grid-flow-col justify-items-center">
                        <a
                            href={solExplorerAccountUrl(base58)}
                            className="my-auto mx-1 pointer-events-auto cursor-pointer"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Image
                                loader={imageLoader}
                                src="/images/icons/sol-logo.png"
                                alt="solana logo"
                                className="rounded-full"
                                width={20}
                                height={20}
                            />
                        </a>
                        <a
                            href={solscanAccountUrl(base58)}
                            className="my-auto pointer-events-auto cursor-pointer"
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Image
                                loader={imageLoader}
                                src="/images/icons/solscan.png"
                                alt="solscan logo"
                                className="my-auto mr-2"
                                width={16}
                                height={16}
                            />
                        </a>
                        {env === 'mainnet-beta' ? 'Mainnet' : 'Devnet'}
                    </div>
                </li>
                {env === 'mainnet-beta' ? (
                    <li
                        onMouseDown={() => setEndpoint(ENDPOINTS[1].endpoint)}
                        className="wallet-adapter-dropdown-list-item"
                        role="menuitem"
                    >
                        Devnet
                    </li>
                ) : (
                    <li
                        onMouseDown={() => setEndpoint(ENDPOINTS[0].endpoint)}
                        className="wallet-adapter-dropdown-list-item"
                        role="menuitem"
                    >
                        Mainnet
                    </li>
                )}
                <li
                    onMouseDown={copyAddress}
                    className="wallet-adapter-dropdown-list-item"
                    role="menuitem"
                >
                    {copied ? 'Copied' : 'Copy address'}
                </li>
                <li
                    onMouseDown={openModal}
                    className="wallet-adapter-dropdown-list-item"
                    role="menuitem"
                >
                    Change wallet
                </li>
                <li
                    onMouseDown={disconnect}
                    className="wallet-adapter-dropdown-list-item"
                    role="menuitem"
                >
                    Disconnect
                </li>
            </ul>
        </div>
    );
};
