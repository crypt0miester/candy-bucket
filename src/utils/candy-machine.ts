import { BN, Provider, Wallet } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import {
    createApproveInstruction,
    createInitializeMintInstruction,
    createMintToInstruction,
    createRevokeInstruction,
    MintLayout,
    TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import {
    AccountInfo,
    Commitment,
    Connection,
    Keypair,
    PublicKey,
    SignatureStatus,
    SystemProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
    TransactionSignature
} from '@solana/web3.js';

import { sendTransactions } from './connections';
import {
    CIVIC,
    getAtaForMint,
    getNetworkExpire,
    getNetworkToken,
    SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID
} from './utils';

export const CANDY_MACHINE_PROGRAM_V2 = new PublicKey(
    'cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ'
);

export const CANDY_MACHINE_PROGRAM_V1 = new PublicKey(
    'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ'
);

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

export interface CandyMachine {
    id: PublicKey;
    program: Program;
    state: CandyMachineState;
}

interface CandyMachineState {
    authority: PublicKey;
    itemsAvailable: number;
    itemsRedeemed: number;
    itemsRemaining: number;
    treasury: PublicKey;
    tokenMint: null | PublicKey;
    isSoldOut: boolean;
    isActive: boolean;
    isPresale: boolean;
    isWhitelistOnly: boolean;
    goLiveDate: BN;
    price: BN;
    gatekeeper: null | {
        expireOnUse: boolean;
        gatekeeperNetwork: PublicKey;
    };
    endSettings: null | {
        number: BN;
        endSettingType: any;
    };
    whitelistMintSettings: null | {
        mode: any;
        mint: PublicKey;
        presale: boolean;
        discountPrice: null | BN;
    };
    hiddenSettings: null | {
        name: string;
        uri: string;
        hash: Uint8Array;
    };
    retainAuthority: boolean;
    data: any;
}

export type AccountAndPubkey = {
    pubkey: string;
    account: AccountInfo<Buffer>;
};
export const getCollectionPDA = (candyMachineAddress: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('collection'), candyMachineAddress.toBuffer()],
        CANDY_MACHINE_PROGRAM_V2
    );
};
export const awaitTransactionSignatureConfirmation = async (
    txid: TransactionSignature,
    timeout: number,
    connection: Connection,
    commitment: Commitment = 'recent',
    queryStatus = false
): Promise<SignatureStatus | null | void> => {
    let done = false;
    let status: SignatureStatus | null | void = {
        slot: 0,
        confirmations: 0,
        err: null
    };
    const subId = 0;
    status = await new Promise(async (resolve, reject) => {
        setTimeout(() => {
            if (done) {
                return;
            }
            done = true;
            console.log('Rejecting for timeout...');
            reject({ timeout: true });
        }, timeout);
        while (!done && queryStatus) {
            // eslint-disable-next-line no-loop-func
            (async () => {
                try {
                    const signatureStatuses = await connection.getSignatureStatuses([txid]);
                    status = signatureStatuses && signatureStatuses.value[0];
                    if (!done) {
                        if (!status) {
                            console.log('REST null result for', txid, status);
                        } else if (status.err) {
                            console.log('REST error for', txid, status);
                            done = true;
                            reject(status.err);
                        } else if (!status.confirmations) {
                            console.log('REST no confirmations for', txid, status);
                        } else {
                            console.log('REST confirmation for', txid, status);
                            done = true;
                            resolve(status);
                        }
                    }
                } catch (e) {
                    if (!done) {
                        console.log('REST connection error: txid', txid, e);
                    }
                }
            })();
            await sleep(2000);
        }
    });

    //@ts-ignore
    if (connection._signatureSubscriptions[subId]) {
        connection.removeSignatureListener(subId);
    }
    done = true;
    console.log('Returning status', status);
    return status;
};

/* export */ const createAssociatedTokenAccountInstruction = (
    associatedTokenAddress: PublicKey,
    payer: PublicKey,
    walletAddress: PublicKey,
    splTokenMintAddress: PublicKey
) => {
    const keys = [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
        { pubkey: walletAddress, isSigner: false, isWritable: false },
        { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
        {
            pubkey: SystemProgram.programId,
            isSigner: false,
            isWritable: false
        },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
};

export const getCandyMachineState = async (
    anchorWallet: Wallet,
    candyMachineId: PublicKey,
    connection: Connection
): Promise<CandyMachine> => {
    const provider = new Provider(connection, anchorWallet, {
        preflightCommitment: 'recent'
    });

    const idl = await Program.fetchIdl(CANDY_MACHINE_PROGRAM_V2, provider);

    const program = new Program(idl!, CANDY_MACHINE_PROGRAM_V2, provider);

    const state: any = await program.account.candyMachine.fetch(candyMachineId);
    const itemsAvailable = state.data.itemsAvailable.toNumber();
    const itemsRedeemed = state.itemsRedeemed.toNumber();
    const itemsRemaining = itemsAvailable - itemsRedeemed;

    return {
        id: candyMachineId,
        program,
        state: {
            authority: state.authority,
            itemsAvailable,
            itemsRedeemed,
            itemsRemaining,
            isSoldOut: itemsRemaining === 0,
            isActive: false,
            isPresale: false,
            isWhitelistOnly: false,
            goLiveDate: state.data.goLiveDate,
            treasury: state.wallet,
            tokenMint: state.tokenMint,
            gatekeeper: state.data.gatekeeper,
            endSettings: state.data.endSettings,
            whitelistMintSettings: state.data.whitelistMintSettings,
            hiddenSettings: state.data.hiddenSettings,
            price: state.data.price,
            retainAuthority: state.data.retainAuthority,
            data: state.data
        }
    };
};

export const parseCandyMachineState = async (
    program: Program,
    candyMachineId: PublicKey,
    accountInfo: Buffer
): Promise<CandyMachine> => {
    const state: any = await program.coder.accounts.decode('CandyMachine', accountInfo);
    const itemsAvailable = state.data.itemsAvailable.toNumber();
    const itemsRedeemed = state.itemsRedeemed.toNumber();
    const itemsRemaining = itemsAvailable - itemsRedeemed;

    return {
        id: candyMachineId,
        program,
        state: {
            authority: state.authority,
            itemsAvailable,
            itemsRedeemed,
            itemsRemaining,
            isSoldOut: itemsRemaining === 0,
            isActive: false,
            isPresale: false,
            isWhitelistOnly: false,
            goLiveDate: state.data.goLiveDate,
            treasury: state.wallet,
            tokenMint: state.tokenMint,
            gatekeeper: state.data.gatekeeper,
            endSettings: state.data.endSettings,
            whitelistMintSettings: state.data.whitelistMintSettings,
            hiddenSettings: state.data.hiddenSettings,
            price: state.data.price,
            retainAuthority: state.data.retainAuthority,
            data: state.data
        }
    };
};

const getMasterEdition = async (mint: PublicKey): Promise<PublicKey> => {
    return (
        await PublicKey.findProgramAddress(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
                Buffer.from('edition')
            ],
            TOKEN_METADATA_PROGRAM_ID
        )
    )[0];
};

const getMetadata = async (mint: PublicKey): Promise<PublicKey> => {
    return (
        await PublicKey.findProgramAddress(
            [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
            TOKEN_METADATA_PROGRAM_ID
        )
    )[0];
};

export const getCandyMachineCreator = async (
    candyMachine: PublicKey
): Promise<[PublicKey, number]> => {
    return await PublicKey.findProgramAddress(
        [Buffer.from('candy_machine'), candyMachine.toBuffer()],
        CANDY_MACHINE_PROGRAM_V2
    );
};

export const mintOneToken = async (
    candyMachine: CandyMachine,
    payer: PublicKey,
    mint: Keypair
): Promise<{ txs: { txid: string[] }; lvb: number; metadataAddress: PublicKey } | undefined> => {
    const userTokenAccountAddress = (await getAtaForMint(mint.publicKey, payer))[0];

    const userPayingAccountAddress = candyMachine.state.tokenMint
        ? (await getAtaForMint(candyMachine.state.tokenMint, payer))[0]
        : payer;

    const candyMachineAddress = candyMachine.id;
    const remainingAccounts = [];
    const signers: Keypair[] = [mint];
    const cleanupInstructions = [];
    const instructions = [
        SystemProgram.createAccount({
            fromPubkey: payer,
            newAccountPubkey: mint.publicKey,
            space: MintLayout.span,
            lamports:
                await candyMachine.program.provider.connection.getMinimumBalanceForRentExemption(
                    MintLayout.span
                ),
            programId: TOKEN_PROGRAM_ID
        }),
        createInitializeMintInstruction(mint.publicKey, 0, payer, payer, TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(
            userTokenAccountAddress,
            payer,
            payer,
            mint.publicKey
        ),
        createMintToInstruction(
            mint.publicKey,
            userTokenAccountAddress,
            payer,
            1,
            [],
            TOKEN_PROGRAM_ID
        )
    ];

    if (candyMachine.state.gatekeeper) {
        remainingAccounts.push({
            pubkey: (
                await getNetworkToken(payer, candyMachine.state.gatekeeper.gatekeeperNetwork)
            )[0],
            isWritable: true,
            isSigner: false
        });
        if (candyMachine.state.gatekeeper.expireOnUse) {
            remainingAccounts.push({
                pubkey: CIVIC,
                isWritable: false,
                isSigner: false
            });
            remainingAccounts.push({
                pubkey: (
                    await getNetworkExpire(candyMachine.state.gatekeeper.gatekeeperNetwork)
                )[0],
                isWritable: false,
                isSigner: false
            });
        }
    }
    if (candyMachine.state.whitelistMintSettings) {
        const mint = new PublicKey(candyMachine.state.whitelistMintSettings.mint);

        const whitelistToken = (await getAtaForMint(mint, payer))[0];
        remainingAccounts.push({
            pubkey: whitelistToken,
            isWritable: true,
            isSigner: false
        });

        if (candyMachine.state.whitelistMintSettings.mode.burnEveryTime) {
            const whitelistBurnAuthority = Keypair.generate();

            remainingAccounts.push({
                pubkey: mint,
                isWritable: true,
                isSigner: false
            });
            remainingAccounts.push({
                pubkey: whitelistBurnAuthority.publicKey,
                isWritable: false,
                isSigner: true
            });
            signers.push(whitelistBurnAuthority);
            const exists = await candyMachine.program.provider.connection.getAccountInfo(
                whitelistToken
            );
            if (exists) {
                instructions.push(
                    createApproveInstruction(
                        whitelistToken,
                        whitelistBurnAuthority.publicKey,
                        payer,
                        1,
                        [],
                        TOKEN_PROGRAM_ID
                    )
                );
                cleanupInstructions.push(
                    createRevokeInstruction(whitelistToken, payer, [], TOKEN_PROGRAM_ID)
                );
            }
        }
    }

    if (candyMachine.state.tokenMint) {
        const transferAuthority = Keypair.generate();

        signers.push(transferAuthority);
        remainingAccounts.push({
            pubkey: userPayingAccountAddress,
            isWritable: true,
            isSigner: false
        });
        remainingAccounts.push({
            pubkey: transferAuthority.publicKey,
            isWritable: false,
            isSigner: true
        });

        instructions.push(
            createApproveInstruction(
                userPayingAccountAddress,
                transferAuthority.publicKey,
                payer,
                candyMachine.state.price.toNumber(),
                [],
                TOKEN_PROGRAM_ID
            )
        );
        cleanupInstructions.push(
            createRevokeInstruction(userPayingAccountAddress, payer, [], TOKEN_PROGRAM_ID)
        );
    }
    const metadataAddress = await getMetadata(mint.publicKey);
    const masterEdition = await getMasterEdition(mint.publicKey);

    const [candyMachineCreator, creatorBump] = await getCandyMachineCreator(candyMachineAddress);

    instructions.push(
        await candyMachine.program.instruction.mintNft(creatorBump, {
            accounts: {
                candyMachine: candyMachineAddress,
                candyMachineCreator,
                payer: payer,
                wallet: candyMachine.state.treasury,
                mint: mint.publicKey,
                metadata: metadataAddress,
                masterEdition,
                mintAuthority: payer,
                updateAuthority: payer,
                tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                rent: SYSVAR_RENT_PUBKEY,
                clock: SYSVAR_CLOCK_PUBKEY,
                recentBlockhashes: SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
                instructionSysvarAccount: SYSVAR_INSTRUCTIONS_PUBKEY
            },
            remainingAccounts: remainingAccounts.length > 0 ? remainingAccounts : undefined
        })
    );
    const sentTransaction = await sendTransactions(
        candyMachine.program.provider.connection,
        candyMachine.program.provider.wallet,
        [instructions, cleanupInstructions],
        [signers, []]
    );

    try {
        return {
            txs: { txid: sentTransaction.txs.map((t) => t.txid) },
            lvb: sentTransaction.lastValidBlockHeight,
            metadataAddress: metadataAddress
        };
    } catch (e) {
        console.log(e);
    }

    return {
        txs: { txid: [''] },
        lvb: sentTransaction.lastValidBlockHeight,
        metadataAddress: metadataAddress
    };
};

export const shortenAddress = (address: string, chars = 4): string => {
    return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};

export const getCandyProgram = async (
    anchorWallet: Wallet,
    connection: Connection
): Promise<Program> => {
    const provider = new Provider(connection, anchorWallet, {
        preflightCommitment: 'recent'
    });

    const idl = await Program.fetchIdl(CANDY_MACHINE_PROGRAM_V2, provider);

    const program = new Program(idl!, CANDY_MACHINE_PROGRAM_V2, provider);

    return program;
};

export const getCandyProgramV1 = async (
    anchorWallet: Wallet,
    connection: Connection
): Promise<Program> => {
    const provider = new Provider(connection, anchorWallet, {
        preflightCommitment: 'recent'
    });

    const idl = await Program.fetchIdl(CANDY_MACHINE_PROGRAM_V1, provider);

    const program = new Program(idl!, CANDY_MACHINE_PROGRAM_V1, provider);

    return program;
};

export async function getProgramAccounts(
    connection: Connection,
    programId: string,
    configOrCommitment?: any
): Promise<AccountAndPubkey[]> {
    const extra: any = {};
    let commitment;
    //let encoding;

    if (configOrCommitment) {
        if (typeof configOrCommitment === 'string') {
            commitment = configOrCommitment;
        } else {
            commitment = configOrCommitment.commitment;
            //encoding = configOrCommitment.encoding;

            if (configOrCommitment.dataSlice) {
                extra.dataSlice = configOrCommitment.dataSlice;
            }

            if (configOrCommitment.filters) {
                extra.filters = configOrCommitment.filters;
            }
        }
    }

    const args = connection._buildArgs([programId], commitment, 'base64', extra);
    const unsafeRes = await (connection as any)._rpcRequest('getProgramAccounts', args);

    return unsafeResAccounts(unsafeRes.result);
}
function unsafeResAccounts(
    data: Array<{
        account: AccountInfo<[string, string]>;
        pubkey: string;
    }>
) {
    return data.map((item) => ({
        account: unsafeAccount(item.account),
        pubkey: item.pubkey
    }));
}

function unsafeAccount(account: AccountInfo<[string, string]>) {
    return {
        // TODO: possible delay parsing could be added here
        data: Buffer.from(account.data[0], 'base64'),
        executable: account.executable,
        lamports: account.lamports,
        // TODO: maybe we can do it in lazy way? or just use string
        owner: account.owner
    } as AccountInfo<Buffer>;
}

// Thank you jare for the code below
// Please follow him on twitter https://twitter.com/STACCart
export async function withdraw(
    anchorProgram: Program,
    anchorWallet: Wallet,
    candyOwner: PublicKey,
    configAddress: PublicKey,
    lamports: number
): Promise<{ txs: { txid: string[] }; lvb: number } | undefined> {
    const instructions = [
        anchorProgram.instruction.withdrawFunds({
            accounts: {
                config: configAddress,
                authority: candyOwner
            }
        })
    ];
    const cbfee = 1 / 100;
    const totalComLamports = Math.floor(lamports * cbfee);
    const lamports162 = Math.floor(totalComLamports * 0.262);
    const lamports138 = Math.floor(totalComLamports * 0.138);
    const lamports30 = Math.floor(totalComLamports * 0.3);
    const addys = [
        // wabi
        new PublicKey('wabiBSbjfWzu9N7pMGx164ujpoEpcbn2VGY3TmNsHrL'),
        // cryptomiester
        new PublicKey('C3EShqKLs1HxJ3Rs24zAJuNHap3xevRL6JR8qBkBpvgc')
    ];
    addys.forEach((addy) => {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: candyOwner,
                toPubkey: addy,
                lamports: lamports30
            })
        );
    });
    // for jare
    // the commission for jare has been added for development purposes
    instructions.push(
        SystemProgram.transfer({
            fromPubkey: candyOwner,
            toPubkey: new PublicKey('HdrX6F6wT7Pqznwiu5V3QwcCGraDESBX8Em5AGsK1VTt'),
            lamports: lamports138
        })
    );
    // for development
    instructions.push(
        SystemProgram.transfer({
            fromPubkey: candyOwner,
            toPubkey: new PublicKey('RiChFBkP9b22YyFgFJg2DRAcXzYMAFuW3ADx9KLxb46'),
            lamports: lamports162
        })
    );
    const sentTransaction = await sendTransactions(
        anchorProgram.provider.connection,
        anchorWallet,
        [instructions],
        [[], []]
    );
    try {
        return {
            txs: { txid: sentTransaction.txs.map((t) => t.txid) },
            lvb: sentTransaction.lastValidBlockHeight
        };
    } catch (e) {
        console.log(e);
    }

    return { txs: { txid: [''] }, lvb: sentTransaction.lastValidBlockHeight };
}

export async function withdrawV2(
    anchorProgram: Program,
    anchorWallet: Wallet,
    candyOwner: PublicKey,
    candyAddress: PublicKey,
    lamports: number
): Promise<{ txs: { txid: string[] }; lvb: number } | undefined> {
    const instructions = [
        anchorProgram.instruction.withdrawFunds({
            accounts: {
                candyMachine: candyAddress,
                authority: candyOwner
            }
        })
    ];
    const cbfee = 1 / 100;
    const totalComLamports = Math.floor(lamports * cbfee);
    const lamports162 = Math.floor(totalComLamports * 0.262);
    const lamports138 = Math.floor(totalComLamports * 0.138);
    const lamports30 = Math.floor(totalComLamports * 0.3);
    const addys = [
        // wabi
        new PublicKey('wabiBSbjfWzu9N7pMGx164ujpoEpcbn2VGY3TmNsHrL'),
        // cryptomiester
        new PublicKey('C3EShqKLs1HxJ3Rs24zAJuNHap3xevRL6JR8qBkBpvgc')
    ];
    addys.forEach((addy) => {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: candyOwner,
                toPubkey: addy,
                lamports: lamports30
            })
        );
    });
    // for jare
    // the commission for jare has been added for development purposes
    instructions.push(
        SystemProgram.transfer({
            fromPubkey: candyOwner,
            toPubkey: new PublicKey('C3EShqKLs1HxJ3Rs24zAJuNHap3xevRL6JR8qBkBpvgc'),
            lamports: lamports138
        })
    );
    // for development
    instructions.push(
        SystemProgram.transfer({
            fromPubkey: candyOwner,
            toPubkey: new PublicKey('RiChFBkP9b22YyFgFJg2DRAcXzYMAFuW3ADx9KLxb46'),
            lamports: lamports162
        })
    );
    const sentTransaction = await sendTransactions(
        anchorProgram.provider.connection,
        anchorWallet,
        [instructions],
        [[], []]
    );
    try {
        return {
            txs: { txid: sentTransaction.txs.map((t) => t.txid) },
            lvb: sentTransaction.lastValidBlockHeight
        };
    } catch (e) {
        console.log(e);
    }

    return { txs: { txid: [''] }, lvb: sentTransaction.lastValidBlockHeight };
}
