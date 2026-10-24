import testnet from './contracts.testnet.json';
import mainnet from './contracts.mainnet.json';

export type StellarNetwork = 'testnet' | 'mainnet';
export type ContractName = keyof typeof testnet.contracts;

export interface NetworkConfig {
  network: StellarNetwork;
  rpcUrl: string;
  networkPassphrase: string;
  contracts: Record<ContractName, string | null>;
}

const CONFIGS: Record<StellarNetwork, NetworkConfig> = {
  testnet: testnet as NetworkConfig,
  mainnet: mainnet as NetworkConfig,
};

export function getNetworkConfig(network: StellarNetwork): NetworkConfig {
  return CONFIGS[network];
}

/**
 * Contract IDs are data, not code: record a deployment by editing the JSON file
 * for that network. Throws when the contract has not been deployed there yet.
 */
export function getContractId(network: StellarNetwork, name: ContractName): string {
  const id = CONFIGS[network].contracts[name];
  if (!id) {
    throw new Error(`Contract "${name}" has no deployment recorded for ${network}`);
  }
  return id;
}
