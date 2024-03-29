/**
 * Send transactions straight to the TPU Leaders.
 * This is a port of solana's rust tpu_client.
 * Sending transactions straight to TPU leaders can be helpful when the RPC you're using has a rate limit.
 * Forked from https://github.com/lmvdz/tpu-client to use the latest confirm with blockhash strategy.
 * TODO: PR the repo.
 * TODO: make a python version. :)
 * Untested code. please tread carefully.
 */

import {
    BlockhashWithExpiryBlockHeight,
    BlockheightBasedTransactionConfirmationStrategy,
    Commitment,
    ConfirmOptions,
    Connection,
    ConnectionConfig,
    PublicKey,
    Signer,
    Transaction,
    TransactionSignature
} from '@solana/web3.js';
import bs58 from 'bs58';
import { default as Denque } from 'denque';
import dgram from 'dgram';

export class LeaderTpuCache {
    leaderTpuMap: Map<string, string> | undefined;
    connection: Connection;
    first_slot: number;
    slots_in_epoch: number | undefined;
    last_epoch_info_slot: number | undefined;
    leaders: Array<PublicKey> | undefined;
    private constructor(connection: Connection, startSlot: number) {
        this.connection = connection;
        this.first_slot = startSlot;
    }
    static load(connection: Connection, startSlot: number): Promise<LeaderTpuCache> {
        return new Promise((resolve) => {
            const leaderTpuCache = new LeaderTpuCache(connection, startSlot);
            leaderTpuCache.connection.getEpochInfo().then((epochInfo) => {
                leaderTpuCache.slots_in_epoch = epochInfo.slotsInEpoch;
                leaderTpuCache
                    .fetchSlotLeaders(leaderTpuCache.first_slot, leaderTpuCache.slots_in_epoch)
                    .then((leaders) => {
                        leaderTpuCache.leaders = leaders;
                        leaderTpuCache.fetchClusterTpuSockets().then((leaderTpuMap) => {
                            leaderTpuCache.leaderTpuMap = leaderTpuMap;
                            resolve(leaderTpuCache);
                        });
                    });
            });
        });
    }
    fetchClusterTpuSockets(): Promise<Map<string, string>> {
        return new Promise((resolve, reject) => {
            const map = new Map<string, string>();
            this.connection
                .getClusterNodes()
                .then((contactInfo) => {
                    contactInfo.forEach((contactInfo) => {
                        map.set(contactInfo.pubkey, contactInfo.tpu!);
                    });
                    resolve(map);
                })
                .catch((error) => {
                    reject(error);
                });
        });
    }
    fetchSlotLeaders(start_slot: number, slots_in_epoch: number): Promise<Array<PublicKey>> {
        const fanout = Math.min(2 * MAX_FANOUT_SLOTS, slots_in_epoch);
        return this.connection.getSlotLeaders(start_slot, fanout);
    }
    lastSlot(): number {
        return this.first_slot + this.leaders!.length - 1;
    }
    getSlotLeader(slot: number): PublicKey | null {
        if (slot >= this.first_slot) {
            const index = slot - this.first_slot;
            return this.leaders![index];
        } else {
            return null;
        }
    }
    getLeaderSockets(fanout_slots: number): Promise<Array<string>> {
        return new Promise((resolve) => {
            const leaderSet = new Set<string>();
            const leaderSockets = new Array<string>();
            let checkedSlots = 0;
            this.leaders!.forEach((leader) => {
                const tpu_socket = this.leaderTpuMap!.get(leader.toBase58());
                if (tpu_socket !== undefined && tpu_socket !== null) {
                    if (!leaderSet.has(leader.toBase58())) {
                        leaderSet.add(leader.toBase58());
                        leaderSockets.push(tpu_socket);
                    }
                } else {
                    console.log('TPU not available for leader: ', leader.toBase58());
                }
                checkedSlots++;
                if (checkedSlots === fanout_slots) {
                    resolve(leaderSockets);
                }
            });
        });
    }
}

export const MAX_SLOT_SKIP_DISTANCE = 48;
export const DEFAULT_FANOUT_SLOTS = 12;
export const MAX_FANOUT_SLOTS = 100;

export class RecentLeaderSlots {
    recent_slots: Denque;

    //@ts-check
    /**
     *
     * @param current_slot {number}
     */
    constructor(current_slot: number) {
        this.recent_slots = new Denque();
        this.recent_slots.push(current_slot);
    }

    //@ts-check
    /**
     *
     * @param current_slot {number}
     */
    recordSlot(current_slot: number) {
        this.recent_slots.push(current_slot);
        while (this.recent_slots.length > 12) {
            this.recent_slots.pop();
        }
    }

    //@ts-check
    /**
     *
     * @returns {number}
     */
    estimatedCurrentSlot(): number {
        if (this.recent_slots.isEmpty()) {
            throw new Error('recent slots is empty');
        }
        const sortedRecentSlots = this.recent_slots.toArray().sort((a, b) => a - b);
        const max_index = sortedRecentSlots.length - 1;
        const median_index = max_index / 2;
        const median_recent_slot = sortedRecentSlots[median_index];
        const expected_current_slot = median_recent_slot + (max_index - median_index);
        const max_reasonable_current_slot = expected_current_slot + MAX_SLOT_SKIP_DISTANCE;
        return sortedRecentSlots.reverse().find((slot) => slot <= max_reasonable_current_slot);
    }
}

export interface TpuClientConfig {
    fanoutSlots: number;
}

export class TpuClient {
    sendSocket: dgram.Socket;
    fanoutSlots: number;
    leaderTpuService: LeaderTpuService | undefined;
    exit: boolean;
    connection: Connection;

    //@ts-check
    /**
     *
     * @param connection {Connection}
     * @param config {TpuClientConfig}
     */
    private constructor(
        connection: Connection,
        config: TpuClientConfig = { fanoutSlots: DEFAULT_FANOUT_SLOTS }
    ) {
        this.connection = connection;
        this.exit = false;
        this.sendSocket = dgram.createSocket('udp4');
        this.fanoutSlots = Math.max(Math.min(config.fanoutSlots, MAX_FANOUT_SLOTS), 1);
        console.log('started tpu client');
    }

    //@ts-check
    /**
     *
     * @param connection {Connection}
     * @param websocketUrl {string}
     * @param config {TpuClientConfig}
     * @returns {Promise<TpuClient>}
     */
    static load(
        connection: Connection,
        websocketUrl = '',
        config: TpuClientConfig = { fanoutSlots: DEFAULT_FANOUT_SLOTS }
    ): Promise<TpuClient> {
        return new Promise((resolve) => {
            const tpuClient = new TpuClient(connection, config);
            LeaderTpuService.load(tpuClient.connection, websocketUrl).then((leaderTpuService) => {
                tpuClient.leaderTpuService = leaderTpuService;
                resolve(tpuClient);
            });
        });
    }

    //@ts-check
    /**
     *
     * @param transaction {Transaction}
     * @param signers {Array<Signer>}
     * @returns {Promise<string>}
     */
    async sendTransaction(transaction: Transaction, signers: Array<Signer>): Promise<string> {
        if (transaction.nonceInfo) {
            transaction.sign(...signers);
        } else {
            const latestBlockhash = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = latestBlockhash.blockhash;
            transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
            transaction.sign(...signers);
        }
        const rawTransaction = transaction.serialize();
        return this.sendRawTransaction(rawTransaction);
    }

    //@ts-check
    /**
     *
     * @param rawTransaction {Buffer | number[] | Uint8ARray}
     * @returns {Promise<string>}
     */
    async sendRawTransaction(rawTransaction: Buffer | number[] | Uint8Array): Promise<string> {
        return new Promise((resolve, reject) => {
            this.leaderTpuService!.leaderTpuSockets(this.fanoutSlots).then((tpu_addresses) => {
                tpu_addresses.forEach((tpu_address) => {
                    this.sendSocket.send(
                        rawTransaction,
                        parseInt(tpu_address.split(':')[1]),
                        tpu_address.split(':')[0],
                        (error) => {
                            if (!error) {
                                const message = Transaction.from(rawTransaction);
                                resolve(bs58.encode(message.signature!));
                            } else {
                                console.error(error);
                                reject(error);
                            }
                        }
                    );
                });
            });
        });
    }
}

export class LeaderTpuService {
    recentSlots: RecentLeaderSlots | undefined;
    leaderTpuCache: LeaderTpuCache | undefined;
    subscription: number | null | undefined;
    connection: Connection;

    //@ts-check
    /**
     *
     * @param connection {Connection}
     */
    private constructor(connection: Connection) {
        this.connection = connection;
    }

    //@ts-check
    /**
     *
     * @param connection {Connection}
     * @param websocket_url {string}
     * @returns {Promise<LeaderTpuService}
     */
    static load(connection: Connection, websocket_url = ''): Promise<LeaderTpuService> {
        return new Promise((resolve) => {
            const leaderTpuService = new LeaderTpuService(connection);
            leaderTpuService.connection.getSlot('processed').then((start_slot) => {
                leaderTpuService.recentSlots = new RecentLeaderSlots(start_slot);
                LeaderTpuCache.load(connection, start_slot).then((leaderTpuCache) => {
                    leaderTpuService.leaderTpuCache = leaderTpuCache;
                    if (websocket_url !== '') {
                        leaderTpuService.subscription = connection.onSlotUpdate((slotUpdate) => {
                            if (slotUpdate.type === 'completed') {
                                slotUpdate.slot++;
                            }
                            leaderTpuService.recentSlots!.recordSlot(slotUpdate.slot);
                        });
                    } else {
                        leaderTpuService.subscription = null;
                    }
                    leaderTpuService.run();
                    resolve(leaderTpuService);
                });
            });
        });
    }

    //@ts-check
    /**
     *
     * @param fanout_slots {number}
     * @returns {Promise<string[]>}
     */
    leaderTpuSockets(fanout_slots: number): Promise<string[]> {
        return this.leaderTpuCache!.getLeaderSockets(fanout_slots);
    }

    //@ts-check
    /**
     * @returns {void}
     */
    async run() {
        const last_cluster_refresh = Date.now();
        let sleep_ms = 1000;
        setTimeout(async () => {
            sleep_ms = 1000;
            if (Date.now() - last_cluster_refresh > 1000 * 5 * 60) {
                try {
                    this.leaderTpuCache!.leaderTpuMap =
                        await this.leaderTpuCache!.fetchClusterTpuSockets();
                } catch (error) {
                    console.warn('Failed to fetch cluster tpu sockets', error);
                    sleep_ms = 1000;
                }
            }
            const estimatedCurrentSlot = this.recentSlots!.estimatedCurrentSlot();
            if (
                estimatedCurrentSlot >=
                this.leaderTpuCache?.last_epoch_info_slot! - this.leaderTpuCache?.slots_in_epoch!
            ) {
                try {
                    const epochInfo = await this.connection.getEpochInfo('recent');
                    this.leaderTpuCache!.slots_in_epoch = epochInfo.slotsInEpoch;
                    this.leaderTpuCache!.last_epoch_info_slot = estimatedCurrentSlot;
                } catch (error) {
                    console.warn('failed to get epoch info');
                }
            }
            if (estimatedCurrentSlot >= this.leaderTpuCache!.lastSlot() - MAX_FANOUT_SLOTS) {
                try {
                    const slot_leaders = await this.leaderTpuCache!.fetchSlotLeaders(
                        estimatedCurrentSlot,
                        this.leaderTpuCache?.slots_in_epoch!
                    );
                    this.leaderTpuCache!.first_slot = estimatedCurrentSlot;
                    this.leaderTpuCache!.leaders = slot_leaders;
                } catch (error) {
                    console.warn(
                        `Failed to fetch slot leaders (current estimated slot: ${estimatedCurrentSlot})`,
                        error
                    );
                    sleep_ms = 1000;
                }
            }
            this.run();
        }, sleep_ms);
    }
}

export class TpuConnection extends Connection {
    tpuClient?: TpuClient;

    //@ts-check
    /**
     *
     * @param endpoint {string}
     * @param commitmentOrConfig {Commitment | ConnectionConfig}
     */
    private constructor(endpoint: string, commitmentOrConfig?: Commitment | ConnectionConfig) {
        super(endpoint, commitmentOrConfig);
    }

    //@ts-check
    /**
     *
     * @param transaction {Transaction}
     * @param signers {Array<Signer>}
     * @returns {Promise<string>}
     */
    sendTransaction(transaction: Transaction, signers: Array<Signer>): Promise<string> {
        return this.tpuClient!.sendTransaction(transaction, signers);
    }

    //@ts-check
    /**
     *
     * @param rawTransaction {Buffer | Array<number> | Uint8Array}
     * @returns {Promise<string>}
     */
    sendRawTransaction(rawTransaction: Buffer | Array<number> | Uint8Array): Promise<string> {
        return this.tpuClient!.sendRawTransaction(rawTransaction);
    }

    ///@ts-check
    /**
     *
     * @param connection {TpuConnection}
     * @param transaction {Transaction}
     * @param signers {Array<Signer>}
     * @param options {ConfirmOptions}
     * @returns {Promise<TransactionSignature>}
     */
    async sendAndConfirmTransaction(
        connection: TpuConnection,
        transaction: Transaction,
        signers: Array<Signer>,
        options?: ConfirmOptions
    ): Promise<TransactionSignature> {
        let strategy: BlockheightBasedTransactionConfirmationStrategy;
        const signature = await this.sendTransaction(transaction, signers);
        if (transaction.lastValidBlockHeight) {
            strategy = {
                signature: signature,
                blockhash: transaction.recentBlockhash!,
                lastValidBlockHeight: transaction.lastValidBlockHeight!
            };
            const status = (await connection.confirmTransaction(strategy, options?.commitment))
                .value;
            if (status.err) {
                throw new Error(`Transaction ${signature} failed (${JSON.stringify(status)})`);
            }
        } else {
            const status = (await connection.confirmTransaction(signature, options?.commitment))
                .value;
            if (status.err) {
                throw new Error(`Transaction ${signature} failed (${JSON.stringify(status)})`);
            }
        }
        return signature;
    }

    //@ts-check
    /**
     *
     * @param connection {TpuConnection}
     * @param rawTransaction {Buffer | Array<number> | Uint8Array}
     * @param options {ConfirmOptions}
     * @param blockhashWithExpiry {BlockhashWithExpiryBlockHeight}
     * @returns {Promise<string>}
     */
    async sendAndConfirmRawTransaction(
        connection: TpuConnection,
        rawTransaction: Buffer | Array<number> | Uint8Array,
        options?: ConfirmOptions,
        blockhashWithExpiry?: BlockhashWithExpiryBlockHeight
    ): Promise<string> {
        let strategy: BlockheightBasedTransactionConfirmationStrategy;
        const signature = await this.sendRawTransaction(rawTransaction);
        if (blockhashWithExpiry?.lastValidBlockHeight) {
            strategy = {
                signature: signature,
                blockhash: blockhashWithExpiry.blockhash!,
                lastValidBlockHeight: blockhashWithExpiry.lastValidBlockHeight!
            };
            const status = (await connection.confirmTransaction(strategy, options?.commitment))
                .value;
            if (status.err) {
                throw new Error(`Transaction ${signature} failed (${JSON.stringify(status)})`);
            }
        } else {
            const status = (await connection.confirmTransaction(signature, options?.commitment))
                .value;
            if (status.err) {
                throw new Error(`Transaction ${signature} failed (${JSON.stringify(status)})`);
            }
        }
        return signature;
    }

    //@ts-check
    /**
     *
     * @param endpoint {string}
     * @param commitmentOrConfig {Commitment | ConnectionConfig}
     * @returns {Promise<TpuConnection>}
     */
    static load(
        endpoint: string,
        commitmentOrConfig?: Commitment | ConnectionConfig
    ): Promise<TpuConnection> {
        return new Promise((resolve) => {
            const tpuConnection = new TpuConnection(endpoint, commitmentOrConfig);
            TpuClient.load(tpuConnection).then((tpuClient) => {
                tpuConnection.tpuClient = tpuClient;
                resolve(tpuConnection);
            });
        });
    }
}
/**
 * How to use 
 * 
const rpcurl = 'https://api.mainnet-beta.solana.com';
const tpuConnection = TpuConnection.load(rpcurl, { commitment: 'processed' });

(async () => {
    let tx = new Transaction();
    tx.add(instruction);
    tx.feePayer = wallet.payer
    const signers = [wallet.payer]
    tx = await wallet.signTransaction(tx);
    
    const block: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash(commitment);
    tx.recentBlockhash = block.blockhash;
    tx.lastValidBlockHeight = block.lastValidBlockHeight;
    
    const signature = await tpuConnection.sendAndConfirmTransaction(tx, ...signers);
})();

 */
