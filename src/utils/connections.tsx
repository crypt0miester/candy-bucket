import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import {
    BlockhashWithExpiryBlockHeight,
    BlockheightBasedTransactionConfirmationStrategy,
    Commitment,
    Connection,
    Context,
    Keypair,
    RpcResponseAndContext,
    SignatureResult,
    SignatureStatus,
    SimulatedTransactionResponse,
    Transaction,
    TransactionInstruction,
    TransactionSignature
} from '@solana/web3.js';

export const enum TransactionStatus {
    BLOCKHEIGHT_EXCEEDED = 0,
    PROCESSED = 1,
    TIMED_OUT = 2
}
/** TODO: @deprecated need to be updated to latest */
export const getErrorForTransaction = async (connection: Connection, txid: string) => {
    // wait for all confirmation before geting transaction
    await connection.confirmTransaction(txid, 'max');

    const tx = await connection.getParsedConfirmedTransaction(txid);

    const errors: string[] = [];
    if (tx?.meta && tx.meta.logMessages) {
        tx.meta.logMessages.forEach((log) => {
            const regex = /Error: (.*)/gm;
            let m;
            while ((m = regex.exec(log)) !== null) {
                // This is necessary to avoid infinite loops with zero-width matches
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                if (m.length > 1) {
                    errors.push(m[1]);
                }
            }
        });
    }

    return errors;
};

export enum SequenceType {
    Sequential,
    Parallel,
    StopOnFailure
}

export async function sendTransactionsWithManualRetry(
    connection: Connection,
    wallet: any,
    instructions: TransactionInstruction[][],
    signers: Keypair[][]
): Promise<(string | undefined)[]> {
    let stopPoint = 0;
    let tries = 0;
    let lastInstructionsLength = null;
    const toRemoveSigners: Record<number, boolean> = {};
    instructions = instructions.filter((instr, i) => {
        if (instr.length > 0) {
            return true;
        } else {
            toRemoveSigners[i] = true;
            return false;
        }
    });
    let ids: string[] = [];
    let filteredSigners = signers.filter((_, i) => !toRemoveSigners[i]);

    while (stopPoint < instructions.length && tries < 3) {
        instructions = instructions.slice(stopPoint, instructions.length);
        filteredSigners = filteredSigners.slice(stopPoint, filteredSigners.length);

        if (instructions.length === lastInstructionsLength) tries = tries + 1;
        else tries = 0;

        try {
            if (instructions.length === 1) {
                const id = await sendTransactionWithRetry(
                    connection,
                    wallet,
                    instructions[0],
                    filteredSigners[0],
                    'processed'
                );
                ids.push(id.txid);
                stopPoint = 1;
            } else {
                const { txs } = await sendTransactions(
                    connection,
                    wallet,
                    instructions,
                    filteredSigners,
                    SequenceType.StopOnFailure,
                    'processed'
                );
                ids = ids.concat(txs.map((t) => t.txid));
            }
        } catch (e) {
            console.error(e);
        }
        console.log(
            'Died on ',
            stopPoint,
            'retrying from instruction',
            instructions[stopPoint],
            'instructions length is',
            instructions.length
        );
        lastInstructionsLength = instructions.length;
    }

    return ids;
}

export const sendTransactions = async (
    connection: Connection,
    wallet: any,
    instructionSet: TransactionInstruction[][],
    signersSet: Keypair[][],
    sequenceType: SequenceType = SequenceType.Parallel,
    commitment: Commitment = 'processed',
    successCallback: (txid: string, ind: number, lvb: number) => void = (txid, ind, lvb) => {},
    failCallback: (reason: string, ind: number, lvb: number) => boolean = (txid, ind, lvb) => false,
    block?: BlockhashWithExpiryBlockHeight
): Promise<{
    number: number;
    txs: { txid: string; slot: number }[];
    lastValidBlockHeight: number;
}> => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();

    const unsignedTxns: Transaction[] = [];
    const newBlock: BlockhashWithExpiryBlockHeight =
        block || (await connection.getLatestBlockhash(commitment));
    for (let i = 0; i < instructionSet.length; i++) {
        const instructions = instructionSet[i];
        const signers = signersSet[i];

        if (instructions.length === 0) {
            continue;
        }

        const transaction = new Transaction();
        instructions.forEach((instruction) => transaction.add(instruction));
        transaction.recentBlockhash = newBlock.blockhash;
        transaction.lastValidBlockHeight = newBlock.lastValidBlockHeight;

        transaction.feePayer = wallet.publicKey;

        if (signers.length > 0) {
            transaction.partialSign(...signers);
        }

        unsignedTxns.push(transaction);
    }

    const signedTxns = await wallet.signAllTransactions(unsignedTxns);

    const pendingTxns: Promise<{ txid: string; slot: number }>[] = [];

    const breakEarlyObject = { breakEarly: false, i: 0 };
    console.log(
        'Signed txns length',
        signedTxns.length,
        'vs handed in length',
        instructionSet.length
    );
    for (let i = 0; i < signedTxns.length; i++) {
        const signedTxnPromise = sendSignedTransaction({
            connection,
            signedTransaction: signedTxns[i]
        });

        signedTxnPromise
            .then(({ txid, slot }) => {
                successCallback(txid, i, newBlock.lastValidBlockHeight);
            })
            .catch((reason) => {
                failCallback(signedTxns[i], i, newBlock.lastValidBlockHeight);
                if (sequenceType === SequenceType.StopOnFailure) {
                    breakEarlyObject.breakEarly = true;
                    breakEarlyObject.i = i;
                }
            });

        if (sequenceType !== SequenceType.Parallel) {
            try {
                await signedTxnPromise;
            } catch (e) {
                console.log('Caught failure', e);
                if (breakEarlyObject.breakEarly) {
                    console.log('Died on ', breakEarlyObject.i);
                    // Return the txn we failed on by index
                    return {
                        number: breakEarlyObject.i,
                        txs: await Promise.all(pendingTxns),
                        lastValidBlockHeight: newBlock.lastValidBlockHeight
                    };
                }
            }
        } else {
            pendingTxns.push(signedTxnPromise);
        }
    }

    if (sequenceType !== SequenceType.Parallel) {
        await Promise.all(pendingTxns);
    }

    return {
        number: signedTxns.length,
        txs: await Promise.all(pendingTxns),
        lastValidBlockHeight: newBlock.lastValidBlockHeight
    };
};

export const sendTransaction = async (
    connection: Connection,
    wallet: any,
    instructions: TransactionInstruction[],
    signers: Keypair[],
    awaitConfirmation = true,
    commitment: Commitment = 'processed',
    includesFeePayer = false,
    block?: BlockhashWithExpiryBlockHeight
) => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();

    const newBlock = block || (await connection.getLatestBlockhash(commitment));

    let transaction = new Transaction();
    instructions.forEach((instruction) => transaction.add(instruction));

    transaction.recentBlockhash = newBlock.blockhash;
    transaction.lastValidBlockHeight = newBlock.lastValidBlockHeight;

    transaction.feePayer = wallet.publicKey;

    if (signers.length > 0) {
        transaction.partialSign(...signers);
    }
    if (!includesFeePayer) {
        transaction = await wallet.signTransaction(transaction);
    }

    const rawTransaction = transaction.serialize();
    const options = {
        skipPreflight: true,
        commitment
    };

    const txid = await connection.sendRawTransaction(rawTransaction, options);
    let slot = 0;

    if (awaitConfirmation) {
        const confirmation = await awaitTransactionSignatureConfirmationBlockhash(
            txid,
            connection,
            commitment,
            transaction.lastValidBlockHeight!
        );

        if (!confirmation) throw new Error('Timed out awaiting confirmation on transaction');
        slot = confirmation?.slot || 0;

        if (confirmation?.err) {
            const errors = await getErrorForTransaction(connection, txid);

            console.log(errors);
            throw new Error(`Raw transaction ${txid} failed`);
        }
    }

    return { txid, slot };
};

export const sendTransactionWithRetry = async (
    connection: Connection,
    wallet: any,
    instructions: TransactionInstruction[],
    signers: Keypair[],
    commitment: Commitment = 'processed',
    includesFeePayer = false,
    block?: BlockhashWithExpiryBlockHeight,
    beforeSend?: () => void
) => {
    if (!wallet.publicKey) throw new WalletNotConnectedError();

    let transaction = new Transaction();
    instructions.forEach((instruction) => transaction.add(instruction));

    const newBlock = block || (await connection.getLatestBlockhash(commitment));

    transaction.recentBlockhash = newBlock.blockhash;
    transaction.lastValidBlockHeight = newBlock.lastValidBlockHeight;

    transaction.feePayer = wallet.publicKey;

    if (signers.length > 0) {
        transaction.partialSign(...signers);
    }
    if (!includesFeePayer) {
        transaction = await wallet.signTransaction(transaction);
    }

    if (beforeSend) {
        beforeSend();
    }

    const { txid, slot } = await sendSignedTransaction({
        connection,
        signedTransaction: transaction
    });

    return { txid, slot };
};

export const getUnixTs = () => {
    return new Date().getTime() / 1000;
};

const DEFAULT_TIMEOUT = 30000;

export async function sendSignedTransaction({
    signedTransaction,
    connection,
    timeout = DEFAULT_TIMEOUT
}: {
    signedTransaction: Transaction;
    connection: Connection;
    timeout?: number;
}): Promise<{ txid: string; slot: number }> {
    const rawTransaction = signedTransaction.serialize();
    const startTime = getUnixTs();
    let slot = 0;
    const txid: TransactionSignature = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true
    });

    console.log('Started awaiting confirmation for', txid);

    let done = false;
    (async () => {
        while (!done && getUnixTs() - startTime < timeout) {
            connection.sendRawTransaction(rawTransaction, {
                skipPreflight: true
            });
            await sleep(500);
        }
    })();
    try {
        const confirmation = await awaitTransactionSignatureConfirmationBlockhash(
            txid,
            connection,
            'confirmed',
            signedTransaction.lastValidBlockHeight!
        );

        if (!confirmation)
            throw new Error(
                'Transaction failed to catch the latest blockhash while awaiting confirmation on transaction'
            );

        if (confirmation.err) {
            console.error(confirmation.err);
            throw new Error('Transaction failed: Custom instruction error');
        }

        slot = confirmation?.slot || 0;
    } catch (err: any) {
        console.error('Transaction did not go through. Error caught', err);
        if (err.timeout) {
            throw new Error(
                'Transaction failed to catch the latest blockhash while awaiting confirmation on transaction'
            );
        }
        let simulateResult: SimulatedTransactionResponse | null = null;
        try {
            simulateResult = (await simulateTransaction(connection, signedTransaction, 'processed'))
                .value;
        } catch (e) {}
        if (simulateResult && simulateResult.err) {
            if (simulateResult.logs) {
                for (let i = simulateResult.logs.length - 1; i >= 0; --i) {
                    const line = simulateResult.logs[i];
                    if (line.startsWith('Program log: ')) {
                        throw new Error(
                            'Transaction failed: ' + line.slice('Program log: '.length)
                        );
                    }
                }
            }
            throw new Error(JSON.stringify(simulateResult.err));
        }
    } finally {
        done = true;
    }

    console.log('Latency', txid, getUnixTs() - startTime);
    return { txid, slot };
}

/** TODO: @deprecated need to be updated to latest */
async function simulateTransaction(
    connection: Connection,
    transaction: Transaction,
    commitment: Commitment
): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
    // @ts-ignore
    transaction.recentBlockhash = await connection._recentBlockhash(
        // @ts-ignore
        connection._disableBlockhashCaching
    );

    const signData = transaction.serializeMessage();
    // @ts-ignore
    const wireTransaction = transaction._serialize(signData);
    const encodedTransaction = wireTransaction.toString('base64');
    const config: any = { encoding: 'base64', commitment };
    const args = [encodedTransaction, config];

    // @ts-ignore
    const res = await connection._rpcRequest('simulateTransaction', args);
    if (res.error) {
        throw new Error('failed to simulate transaction: ' + res.error.message);
    }
    return res.result;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function awaitTransactionSignatureConfirmationBlockhash(
    txid: TransactionSignature,
    connection: Connection,
    commitment: Commitment = 'confirmed',
    lastValidBlockHeight: number
): Promise<SignatureStatus | null | void> {
    let done = false;
    let status: SignatureStatus | null | void = {
        slot: 0,
        confirmations: 0,
        err: true
    };

    const checkBlockHeight = async () => {
        try {
            const blockHeight = await connection.getBlockHeight(commitment);
            return blockHeight;
        } catch (_e) {
            return -1;
        }
    };

    let subId: number;

    const confirmationPromise = new Promise<{
        __type: TransactionStatus.PROCESSED;
        response: RpcResponseAndContext<SignatureResult>;
    }>((resolve, reject) => {
        try {
            subId = connection.onSignature(
                txid,
                (result: SignatureResult, context: Context) => {
                    subId = 0;
                    const response = {
                        context,
                        value: result
                    };
                    done = true;
                    resolve({ __type: TransactionStatus.PROCESSED, response });
                },
                commitment
            );
        } catch (err) {
            reject(err);
        }
    });

    const expiryPromise = new Promise<{
        __type: TransactionStatus.BLOCKHEIGHT_EXCEEDED;
        response: undefined;
    }>((resolve) => {
        (async () => {
            let currentBlockHeight = await checkBlockHeight();
            if (done) return;
            while (currentBlockHeight <= lastValidBlockHeight) {
                await sleep(1000);
                if (done) return;
                currentBlockHeight = await checkBlockHeight();
                if (done) return;
            }
            resolve({ __type: TransactionStatus.BLOCKHEIGHT_EXCEEDED, response: undefined });
        })();
    });

    let result: RpcResponseAndContext<SignatureResult>;
    try {
        const outcome = await Promise.race([confirmationPromise, expiryPromise]);
        switch (outcome.__type) {
            case TransactionStatus.BLOCKHEIGHT_EXCEEDED:
                console.log('Transaction blockheight exceeded for', txid, status);
            case TransactionStatus.PROCESSED:
                const signatureStatuses = await connection.getSignatureStatuses([txid]);
                status = signatureStatuses && signatureStatuses.value[0];
                result = outcome.response!;
                break;
        }
    } finally {
        if (subId!) {
            connection.removeSignatureListener(subId);
        }
    }

    done = true;
    console.log('Returning status', status!);
    return status;
}
