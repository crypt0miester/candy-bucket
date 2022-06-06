import { WalletError } from '@solana/wallet-adapter-base';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { FC, useEffect } from 'react';

type Props = {
    onUseWalletClick: () => void;
};

export const SelectAndConnectWalletButton: FC<Props> = ({ onUseWalletClick }) => {
    const { setVisible } = useWalletModal();
    const { wallet, connect, connecting, publicKey } = useWallet();

    useEffect(() => {
        if (!publicKey && wallet) {
            try {
                connect();
            } catch (error) {
                console.log('Error connecting to the wallet: ', (error as WalletError).message);
            }
        }
    }, [wallet]);

    const handleWalletClick = () => {
        try {
            if (!wallet) {
                setVisible(true);
            } else {
                connect();
            }
            onUseWalletClick();
        } catch (error) {
            console.log('Error connecting to the wallet: ', (error as WalletError).message);
        }
    };

    return (
        <button
            className="btn text-white rounded-lg btn-lg"
            onClick={handleWalletClick}
            disabled={connecting}
            style={{
                backgroundColor: '#512da8',
                border: 'none !important'
            }}
        >
            {publicKey ? <div>Use Wallet Address</div> : <div>Connect Wallet</div>}
        </button>
    );
};
