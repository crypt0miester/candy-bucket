import { Program, Wallet } from '@project-serum/anchor';
import { useAnchorWallet, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import confetti from 'canvas-confetti';
import { Loader } from 'components';
import { WalletMultiButtonCB } from 'components/wallet-multi-button-cb';
import { useConnection, useConnectionConfig } from 'contexts/connection-context-provider';
import Image from 'next/image';
import Link from 'next/link';
import { FC } from 'react';
import { useEffect, useState } from 'react';
import { useAlert } from 'react-alert';

import {
    AccountAndPubkey,
    CANDY_MACHINE_PROGRAM_V1,
    CANDY_MACHINE_PROGRAM_V2,
    CandyMachine,
    getCandyProgram,
    getCandyProgramV1,
    getProgramAccounts,
    parseCandyMachineState,
    withdraw,
    withdrawV2
} from '../../utils/candy-machine';
import { awaitTransactionSignatureConfirmationBlockhash } from '../../utils/connections';
import { imageLoader } from '../../utils/image-loader';
import { Menu, WalletAmount, WalletHeader } from '../styles';
import styles from './index.module.css';

export const CandyWrapper: FC = () => {
    const wallet = useAnchorWallet();
    const liveWallet = useWallet();
    const [balance, setBalance] = useState<number>();
    const [isRedeeming, setIsRedeeming] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [totalLamportsV1, setTotalLamportsV1] = useState(0);
    const [totalLamportsV2, setTotalLamportsV2] = useState(0);
    const [candyMachinesFetched, setCandyMachinesFetched] = useState(false);
    const [candyProgram, setCandyProgram] = useState<Program>();
    const [cMFoundV1, setCMFoundV1] = useState<AccountAndPubkey[]>([]);
    const [cMFoundV2, setCMFoundV2] = useState<AccountAndPubkey[]>([]);
    const [candyMachines, setCandyMachines] = useState<CandyMachine[]>([]);
    const alert = useAlert();

    const connection = useConnection();
    const { env } = useConnectionConfig();
    const refreshCreatorCMData = () => {
        (async () => {
            if (!wallet) return;
            if (candyMachinesFetched) return;
            const cndyProgram = await getCandyProgram(wallet as Wallet, connection);

            setCandyProgram(cndyProgram);

            const hashConfig = [155, 12, 170, 224, 30, 250, 204, 130];
            const configOrCommitmentV1 = {
                commitment: 'confirmed',
                filters: [
                    {
                        memcmp: {
                            offset: 0,
                            bytes: hashConfig
                        }
                    },
                    {
                        memcmp: {
                            offset: 8,
                            bytes: wallet.publicKey.toBase58()
                        }
                    }
                ]
            };

            const configOrCommitmentV2 = {
                commitment: 'confirmed',
                filters: [
                    {
                        memcmp: {
                            offset: 8,
                            bytes: wallet.publicKey.toBase58()
                        }
                    }
                ]
            };
            const foundMachines_v1: AccountAndPubkey[] = await getProgramAccounts(
                cndyProgram.provider.connection,
                CANDY_MACHINE_PROGRAM_V1.toBase58(),
                configOrCommitmentV1
            );
            setCMFoundV1(foundMachines_v1);
            for (const cm_idx_v1 in foundMachines_v1) {
                setTotalLamportsV1(totalLamportsV1 + foundMachines_v1[cm_idx_v1].account.lamports);
            }
            const foundMachines_v2: AccountAndPubkey[] = await getProgramAccounts(
                cndyProgram.provider.connection,
                CANDY_MACHINE_PROGRAM_V2.toBase58(),
                configOrCommitmentV2
            );
            setCMFoundV2(foundMachines_v2);
            for (const cm_idx_v2 in foundMachines_v2) {
                const t = totalLamportsV2 + foundMachines_v2[cm_idx_v2].account.lamports;
                setTotalLamportsV2(t);

                const cmStates = [
                    ...candyMachines,
                    await parseCandyMachineState(
                        cndyProgram,
                        new PublicKey(foundMachines_v2[cm_idx_v2].pubkey),
                        foundMachines_v2[cm_idx_v2].account.data
                    )
                ];
                setCandyMachines(cmStates);
            }
            setCandyMachinesFetched(true);
        })();
    };

    function throwConfetti(): void {
        confetti({
            particleCount: 400,
            spread: 70,
            origin: { y: 0.6 }
        });
    }

    const onRedeem = async (pubkeyString: string, lamports: number, CMVer: number) => {
        try {
            setIsRedeeming(true);
            if (wallet && pubkeyString && wallet.publicKey) {
                let withdrawTxId;
                alert.show(`Please approve the transaction.`);
                if (CMVer == 2) {
                    withdrawTxId = await withdrawV2(
                        candyProgram!,
                        wallet as Wallet,
                        wallet.publicKey,
                        new PublicKey(pubkeyString),
                        lamports
                    );
                } else {
                    withdrawTxId = await withdraw(
                        await getCandyProgramV1(wallet as Wallet, connection),
                        wallet as Wallet,
                        wallet.publicKey,
                        new PublicKey(pubkeyString),
                        lamports
                    );
                }
                let status: any = { err: true };
                if (withdrawTxId) {
                    alert.show(
                        `Alright waiting for transaction to confirm! txn_id: ${withdrawTxId.txs.txid[0]}`
                    );
                    setIsConfirming(true);
                    status = await awaitTransactionSignatureConfirmationBlockhash(
                        withdrawTxId.txs.txid[0],
                        connection,
                        'finalized',
                        withdrawTxId.lvb
                    );
                }
                if (!status.err) {
                    alert.success('Congratulations! Withdraw succeeded!');
                    throwConfetti();
                } else {
                    alert.error('Redeem failed! Please try again!');
                }
            }
        } catch (error: any) {
            let message = error.msg || 'Redeeming failed! Please try again!';
            if (!error.msg) {
                if (!error.message) {
                    message = 'Transaction Timeout! Please try again.';
                }
            }
            setIsConfirming(false);
            alert.error(message);
        } finally {
            setIsRedeeming(false);
            setIsConfirming(false);
            clearStates();
            getBalance();
        }
    };
    const getBalance = async () => {
        if (wallet) {
            const balance = await connection.getBalance(wallet.publicKey);
            setBalance(balance / LAMPORTS_PER_SOL);
        }
    };
    const solscanAccountUrl = (pubkey: string) => {
        if (env === 'mainnet-beta') {
            return `https://solscan.io/account/${pubkey}`;
        } else {
            return `https://solscan.io/account/${pubkey}?cluster=devnet`;
        }
    };
    const solExplorerAccountUrl = (pubkey: string) => {
        if (env === 'mainnet-beta') {
            return `https://explorer.solana.com/account/${pubkey}`;
        } else {
            return `https://explorer.solana.com/account/${pubkey}?cluster=devnet`;
        }
    };
    const clearStates = () => {
        setCandyMachinesFetched(false);
        setCandyMachines([]);
        setTotalLamportsV1(0);
        setTotalLamportsV2(0);
        setCMFoundV1([]);
        setCMFoundV2([]);
    };

    useEffect(() => {
        (async () => {
            clearStates();
            await getBalance();
        })();
    }, [liveWallet, connection, env]);

    useEffect(() => {
        if (liveWallet.connected) {
            refreshCreatorCMData();
        }
    }, [wallet, connection, candyMachinesFetched, env]);

    return (
        <div className="container mx-auto max-w-6xl  p-8 2xl:px-0">
            <div className={styles.container}>
                <div className="navbar mb-2 shadow-lg h-20 bg-[#00153d] text-neutral-content rounded-box">
                    <div className="flex-none">
                        <Image
                            loader={imageLoader}
                            src="/images/logo.png"
                            alt="logo"
                            className="my-auto"
                            width={60}
                            height={60}
                        />
                    </div>
                    <div className="flex-1 px-2 mx-2">
                        <Menu>
                            <li>
                                <Link href="/">Candy Wrapper</Link>
                            </li>
                            {/* <li>
                                Hi.. I see you have reached here.
                                Welcome, and PRs are welcome. 
                                You can even add your own address if you have worked enough on the repo.
                                This if for a frontend candy machine uploader (WIP)
                                <button className="disabled  opacity-50 hover:opacity-20" disabled>
                                    Candy Mogul
                                </button>
                            </li>
                            <li>
                                This if for a frontend candy minter supply any candy addy and 
                                it will get all the data with mining capability (WIP)
                                <button className="disabled  opacity-50 hover:opacity-20" disabled>
                                    Candy Minter
                                </button>
                            </li>
                            <li>
                                supply any wallet addy and 
                                it will view the nfts and data regarding the wallet. (WIP)
                                <button className="disabled  opacity-50 hover:opacity-20" disabled>
                                    Wallet
                                </button>
                            </li> */}
                        </Menu>
                    </div>
                    <div className="flex-none">
                        <WalletHeader>
                            {wallet ? (
                                <WalletAmount className="bg-[#00153d]">
                                    {(balance || 0).toLocaleString()} SOL
                                    <WalletMultiButtonCB />
                                </WalletAmount>
                            ) : (
                                <WalletMultiButtonCB />
                            )}
                        </WalletHeader>
                    </div>
                </div>

                <div className="text-center pt-2">
                    <div className="hero min-h-10">
                        <div className="text-center hero-content">
                            <div className="max-w-lg">
                                <h1 className="text-3xl font-bold">Candy Wrapper</h1>
                                {env === 'mainnet-beta' ? (
                                    <h1 className="mb-2 text-xl">Mainnet</h1>
                                ) : (
                                    <h1 className="mb-2 text-xl">Devnet</h1>
                                )}
                            </div>
                        </div>
                    </div>
                    {wallet && candyMachinesFetched ? (
                        <div className="container rounded-box bg-[#00153d] pb-4 mb-5 mx-auto">
                            <br />
                            {wallet && cMFoundV1 && cMFoundV1?.length > 0 && (
                                <h3>
                                    {' '}
                                    Found {cMFoundV1.length} in CMv1
                                    {cMFoundV2.length > 0 ? ` and ${cMFoundV2.length} in CMv2` : ''}
                                    .
                                </h3>
                            )}
                            {wallet &&
                                cMFoundV2 &&
                                cMFoundV2?.length > 0 &&
                                cMFoundV1?.length == 0 && (
                                    <h3> Found {cMFoundV2.length} in CMv2.</h3>
                                )}

                            {wallet &&
                                (totalLamportsV2 > 0 || totalLamportsV1 > 0) &&
                                (cMFoundV2.length > 0 || cMFoundV1.length > 0) && (
                                    <h3 className="mb-5">
                                        {' '}
                                        You have
                                        <span className="font-bold">
                                            {' ' +
                                                ((totalLamportsV2 + totalLamportsV1) / 1e9).toFixed(
                                                    3
                                                )}
                                        </span>{' '}
                                        redeemable Sols.
                                    </h3>
                                )}

                            {wallet &&
                                totalLamportsV2 == 0 &&
                                totalLamportsV1 == 0 &&
                                cMFoundV2.length == 0 &&
                                cMFoundV1.length == 0 && <h3> No candy machines found.</h3>}

                            {isConfirming ? (
                                <Loader text="Confirming.." />
                            ) : (
                                <div>
                                    {wallet && totalLamportsV1 > 0 && cMFoundV1.length > 0 && (
                                        <div className="m-4 grid grid-flow-row lg:grid-flow-col gap-4">
                                            {cMFoundV1.map(({ pubkey, account }, idx) => {
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="grid grid-flow-row justify-items-center"
                                                    >
                                                        <div className="grid grid-flow-col justify-items-center">
                                                            <a
                                                                href={solExplorerAccountUrl(pubkey)}
                                                                className="my-auto mx-2"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <Image
                                                                    loader={imageLoader}
                                                                    src="/images/icons/sol-logo.png"
                                                                    alt="solana logo"
                                                                    className="rounded-full"
                                                                    width={18}
                                                                    height={18}
                                                                />
                                                            </a>
                                                            <a
                                                                href={solscanAccountUrl(pubkey)}
                                                                className="my-auto mr-1"
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
                                                            <h3 className="text-xl my-auto">
                                                                {' '}
                                                                CMv1 #{idx + 1}
                                                            </h3>
                                                        </div>
                                                        <a
                                                            onClick={async () => {
                                                                await navigator.clipboard.writeText(
                                                                    pubkey
                                                                );
                                                                alert.show(`Copied ${pubkey}`);
                                                            }}
                                                            className="text-md mb-4 cursor-pointer text-ellipsis overflow-hidden"
                                                        >
                                                            {' '}
                                                            {pubkey}
                                                        </a>
                                                        <button
                                                            className="btn btn-wide rounded-lg bg-[#512da8] hover:bg-black btn-md m-auto"
                                                            disabled={isRedeeming}
                                                            onClick={async () => {
                                                                await onRedeem(
                                                                    pubkey,
                                                                    account.lamports,
                                                                    1
                                                                );
                                                            }}
                                                        >
                                                            {isRedeeming ? 'Redeeming' : 'Redeem'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {wallet && totalLamportsV2 > 0 && cMFoundV2.length > 0 && (
                                        <div className="m-4 grid grid-flow-row lg:grid-flow-col gap-4">
                                            {cMFoundV2.map(({ pubkey, account }, idx) => {
                                                return (
                                                    <div
                                                        key={idx}
                                                        className="grid grid-flow-row justify-items-center"
                                                    >
                                                        <div className="grid grid-flow-col justify-items-center">
                                                            <a
                                                                href={solExplorerAccountUrl(pubkey)}
                                                                className="my-auto mx-2"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                            >
                                                                <Image
                                                                    loader={imageLoader}
                                                                    src="/images/icons/sol-logo.png"
                                                                    alt="solana logo"
                                                                    className="rounded-full"
                                                                    width={18}
                                                                    height={18}
                                                                />
                                                            </a>
                                                            <a
                                                                href={solscanAccountUrl(pubkey)}
                                                                className="my-auto mr-1"
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
                                                            <h3 className="text-xl my-auto">
                                                                {' '}
                                                                CMv2 #{idx + 1}
                                                            </h3>
                                                        </div>
                                                        <a
                                                            onClick={async () => {
                                                                await navigator.clipboard.writeText(
                                                                    pubkey
                                                                );
                                                                alert.show(`Copied ${pubkey}`);
                                                            }}
                                                            className="text-lg mb-4 cursor-pointer text-ellipsis overflow-hidden"
                                                        >
                                                            {' '}
                                                            {pubkey}
                                                        </a>
                                                        <button
                                                            className="btn btn-wide rounded-lg  bg-[#512da8] hover:bg-black btn-md m-auto"
                                                            disabled={isRedeeming}
                                                            onClick={async () => {
                                                                await onRedeem(
                                                                    pubkey,
                                                                    account.lamports,
                                                                    2
                                                                );
                                                            }}
                                                        >
                                                            {isRedeeming ? 'Redeeming' : 'Redeem'}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-2xl my-6">{liveWallet.connected && <Loader />}</div>
                    )}
                    <div className="container rounded-box bg-[#00153d] p-4 mx-auto divide-y ">
                        <div className="m-4 text-left">
                            <h2 className="text-2xl my-4">What is Candy bucket?</h2>
                            <p>
                                Best in class candy machine tools. All code is open sourced. More
                                tools coming soon.
                            </p>
                            <p>
                                We have tried our best to use the latest version of packages (where
                                possible). i.e. React 18.
                            </p>
                            <p>For testing, all tools will be available in devnet as well.</p>
                            <p>
                                Click on the network you would like to use on the dropdown after you
                                connect the wallet.
                            </p>
                        </div>
                        <div className="m-4 text-left">
                            <h2 className="text-2xl my-4">What is Candy Wrapper?</h2>
                            <p>
                                A tool where you could wrap up (withdraw funds) from previously
                                created candy machine v1 and candy machine v2.
                            </p>
                            <p>1% of fees are cut from the total amount.</p>
                            <p>Please do not click Redeem if your candy machine is still live.</p>
                        </div>
                        <div className="m-4 text-left">
                            <h2 className="text-2xl my-4">
                                Where can I find my candy machine creator keypair?
                            </h2>
                            <p>
                                If you have previously created a CM using the same PC/Macbook you
                                would most probably find it in (open a terminal):
                            </p>
                            <div className="my-4 text-sm">
                                <code>cat $HOME/.config/solana/id.json</code>
                            </div>
                            <p>
                                Copy the contents of the file and import the keypair to your
                                favorite wallet, then connect to the site.
                            </p>
                            <p>
                                Or just ask the developer to connect the cm authority to the site.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
