import { BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
    ConfirmedSignatureInfo,
    ConfirmedSignaturesForAddress2Options,
    Connection,
    LAMPORTS_PER_SOL,
    ParsedTransactionWithMeta,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction
} from '@solana/web3.js';

interface Opt extends ConfirmedSignaturesForAddress2Options {
    onTransaction?: (tx: ParsedTransactionWithMeta) => Promise<void>;
    onNoTxn?: () => Promise<void>;
}

export function getSignatureFromTx(tx?: ParsedTransactionWithMeta): string | undefined {
    if (tx) {
        return tx.transaction.signatures[0];
    }
    return undefined;
}

export async function fetchWeb3Transactions(
    conn: Connection,
    account: string,
    opt?: Opt
): Promise<ParsedTransactionWithMeta[] | null> {
    const signatures: ConfirmedSignatureInfo[] = await conn.getConfirmedSignaturesForAddress2(
        new PublicKey(account),
        {
            limit: opt?.limit,
            before: opt?.before,
            until: opt?.until
        },
        'finalized'
    );

    if (signatures) {
        const txs: ParsedTransactionWithMeta[] = [];
        const oldestToLatest = signatures.reverse();

        for (let i = 0; i < oldestToLatest.length; i++) {
            const signature = oldestToLatest[i];
            const tx = await conn.getParsedTransaction(signature.signature);
            if (!tx) {
                opt?.onNoTxn && (await opt.onNoTxn());
                continue;
            }
            opt?.onTransaction && (await opt.onTransaction(tx));

            txs.push(tx);
        }
        return txs;
    }
    return null;
}

export interface AlertState {
    open: boolean;
    message: string;
    severity: 'success' | 'info' | 'warning' | 'error' | undefined;
}

export const toDate = (value?: BN) => {
    if (!value) {
        return;
    }

    return new Date(value.toNumber() * 1000);
};

const numberFormater = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

export const formatNumber = {
    format: (val?: number) => {
        if (!val) {
            return '--';
        }

        return numberFormater.format(val);
    },
    asNumber: (val?: BN) => {
        if (!val) {
            return undefined;
        }

        return val.toNumber() / LAMPORTS_PER_SOL;
    }
};

export const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
);

export const CIVIC = new PublicKey('gatem74V238djXdzWnJf94Wo1DcnuGkfijbf3AuBhfs');

export const getAtaForMint = async (
    mint: PublicKey,
    buyer: PublicKey
): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
        [buyer.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
    );
};

export const getNetworkExpire = async (
    gatekeeperNetwork: PublicKey
): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
        [gatekeeperNetwork.toBuffer(), Buffer.from('expire')],
        CIVIC
    );
};

export const shortenAddress = (address: string, chars = 4): string => {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

export const getNetworkToken = async (
    wallet: PublicKey,
    gatekeeperNetwork: PublicKey
): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
        [
            wallet.toBuffer(),
            Buffer.from('gateway'),
            Buffer.from([0, 0, 0, 0, 0, 0, 0, 0]),
            gatekeeperNetwork.toBuffer()
        ],
        CIVIC
    );
};

export function createAssociatedTokenAccountInstruction(
    associatedTokenAddress: PublicKey,
    payer: PublicKey,
    walletAddress: PublicKey,
    splTokenMintAddress: PublicKey
) {
    const keys = [
        {
            pubkey: payer,
            isSigner: true,
            isWritable: true
        },
        {
            pubkey: associatedTokenAddress,
            isSigner: false,
            isWritable: true
        },
        {
            pubkey: walletAddress,
            isSigner: false,
            isWritable: false
        },
        {
            pubkey: splTokenMintAddress,
            isSigner: false,
            isWritable: false
        },
        {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false
        },
        {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false
        },
        {
            pubkey: SYSVAR_RENT_PUBKEY,
            isSigner: false,
            isWritable: false
        }
    ];
    return new TransactionInstruction({
        keys,
        programId: SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID,
        data: Buffer.from([])
    });
}
