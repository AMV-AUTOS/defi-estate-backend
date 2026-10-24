import {
  Address,
  Contract,
  Keypair,
  Networks,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

export interface StellarServiceEnv {
  network: 'testnet' | 'mainnet' | 'futurenet' | 'standalone';
  rpcUrl: string;
  adminSecret: string;
  networkPassphrase?: string;
}

export interface SorobanRpcClient {
  getAccount(accountId: string): Promise<{ accountId: () => string; sequenceNumber: () => string }>;
  simulateTransaction(tx: Transaction): Promise<SorobanRpc.Api.SimulateTransactionResponse>;
  sendTransaction(tx: Transaction): Promise<SorobanRpc.Api.SendTransactionResponse>;
  getTransaction(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse>;
}

export interface InvocationResult {
  txHash: string;
  result: unknown;
}

export class HttpError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const NETWORK_PASSPHRASES: Record<StellarServiceEnv['network'], string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
  standalone: Networks.STANDALONE,
};

const DEFAULT_TIMEOUT_SECONDS = 30;
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

export class StellarService {
  private readonly networkPassphrase: string;
  private readonly rpc: SorobanRpcClient;
  private readonly adminKeypair: Keypair;

  constructor(env: StellarServiceEnv, rpcClient?: SorobanRpcClient) {
    if (!env.adminSecret) {
      throw new HttpError(500, 'Stellar admin secret is not configured', 'STELLAR_ADMIN_SECRET_MISSING');
    }

    this.networkPassphrase = env.networkPassphrase ?? NETWORK_PASSPHRASES[env.network];
    if (!this.networkPassphrase) {
      throw new HttpError(500, `Unsupported Stellar network: ${env.network}`, 'STELLAR_NETWORK_UNSUPPORTED');
    }

    try {
      this.adminKeypair = Keypair.fromSecret(env.adminSecret);
    } catch {
      // Never include the secret in the error message.
      throw new HttpError(500, 'Invalid Stellar admin secret', 'STELLAR_ADMIN_SECRET_INVALID');
    }

    this.rpc = rpcClient ?? new SorobanRpc.Server(env.rpcUrl);
  }

  get adminPublicKey(): string {
    return this.adminKeypair.publicKey();
  }

  async setWhitelisted(tokenContractId: string, investorAddress: string): Promise<InvocationResult> {
    const args = [
      nativeToScVal(Address.fromString(investorAddress), { type: 'address' }),
      nativeToScVal(true, { type: 'bool' }),
    ];
    return this.invokeContract(tokenContractId, 'set_whitelisted', args);
  }

  async mint(tokenContractId: string, investorAddress: string, amount: bigint | number | string): Promise<InvocationResult> {
    const amountValue = typeof amount === 'bigint' ? amount : BigInt(amount);
    if (amountValue <= 0n) {
      throw new HttpError(400, 'Mint amount must be greater than zero', 'INVALID_MINT_AMOUNT');
    }

    const args = [
      nativeToScVal(Address.fromString(investorAddress), { type: 'address' }),
      nativeToScVal(amountValue, { type: 'i128' }),
    ];
    return this.invokeContract(tokenContractId, 'mint', args);
  }

  private async invokeContract(
    tokenContractId: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<InvocationResult> {
    const contract = new Contract(tokenContractId);
    const operation = contract.call(method, ...args);

    const tx = await this.buildTransaction(operation);
    const prepared = await this.simulate(tx);
    const signed = this.sign(prepared);
    const submitted = await this.submit(signed);
    const final = await this.awaitConfirmation(submitted.hash);

    return {
      txHash: submitted.hash,
      result: this.extractResult(final),
    };
  }

  private async buildTransaction(operation: xdr.Operation): Promise<Transaction> {
    const sourceAccount = await this.rpc.getAccount(this.adminKeypair.publicKey());
    return new TransactionBuilder(sourceAccount as never, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(DEFAULT_TIMEOUT_SECONDS)
      .build();
  }

  private async simulate(tx: Transaction): Promise<Transaction> {
    const simulation = await this.rpc.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simulation)) {
      throw new HttpError(502, `Soroban simulation failed: ${simulation.error}`, 'SOROBAN_SIMULATION_FAILED');
    }

    return SorobanRpc.assembleTransaction(tx, simulation).build();
  }

  private sign(tx: Transaction): Transaction {
    tx.sign(this.adminKeypair);
    return tx;
  }

  private async submit(tx: Transaction): Promise<{ hash: string }> {
    const response = await this.rpc.sendTransaction(tx);

    if (response.status === 'ERROR') {
      const detail = response.errorResult
        ? `: ${response.errorResult.toXDR('base64')}`
        : '';
      throw new HttpError(502, `Soroban submission failed${detail}`, 'SOROBAN_SUBMISSION_FAILED');
    }

    return { hash: response.hash };
  }

  private async awaitConfirmation(hash: string): Promise<SorobanRpc.Api.GetTransactionResponse> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      const response = await this.rpc.getTransaction(hash);

      if (response.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        return response;
      }

      if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new HttpError(502, `Soroban transaction ${hash} failed`, 'SOROBAN_TRANSACTION_FAILED');
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new HttpError(504, `Timed out waiting for Soroban transaction ${hash}`, 'SOROBAN_TRANSACTION_TIMEOUT');
  }

  private extractResult(response: SorobanRpc.Api.GetTransactionResponse): unknown {
    if (response.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return null;
    }

    const returnValue = response.returnValue;
    if (!returnValue) {
      return null;
    }

    try {
      return scValToNative(returnValue);
    } catch {
      return returnValue.toXDR('base64');
    }
  }
}