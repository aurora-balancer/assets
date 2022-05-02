import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { InfuraProvider, JsonRpcProvider } from "@ethersproject/providers";
import { parseBytes32String } from "@ethersproject/strings";
import { TokenInfo } from "@uniswap/token-lists";

import { MinimalTokenInfo, Network } from "../types";

const infuraKey = "93e3393c76ed4e1f940d0266e2fdbda2";

const providers = {
  kovan: new InfuraProvider("kovan", infuraKey),
  homestead: new InfuraProvider("homestead", infuraKey),
  polygon: new InfuraProvider("matic", infuraKey),
  arbitrum: new InfuraProvider("arbitrum", infuraKey),
  auroratest: new JsonRpcProvider("https://testnet.aurora.dev"),
  aurora: new JsonRpcProvider("https://mainnet.aurora.dev"),
};

export const chainIdMap = {
  homestead: 1,
  kovan: 42,
  polygon: 137,
  arbitrum: 42161,
  aurora: 1313161554,
  auroratest: 1313161555,
};

const multicallContract = {
  homestead: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  kovan: "0x5ba1e12693dc8f9c48aad8770482f4739beed696",
  polygon: "0xe2530198A125Dcdc8Fc5476e07BFDFb5203f1102",
  arbitrum: "0xd67950096d029af421a946ffb1e04c94caf8e256",
  aurora: "0x49eb1F160e167aa7bA96BdD88B6C1f2ffda5212A",
  auroratest: "0x1A889db259E05570d13c9f129e9bDD2E70F15A4D",
};

const erc20ABI = [
  "function name() returns (string)",
  "function symbol() returns (string)",
  "function decimals() returns (uint256)",
];

const multicallABI = [
  "function tryAggregate(bool, tuple(address, bytes)[]) view returns (tuple(bool, bytes)[])",
];

const decodeERC20Metadata = (
  nameResponse: string,
  symbolResponse: string,
  decimalsResponse: string
): MinimalTokenInfo => {
  const erc20 = new Interface(erc20ABI);

  let name: string;
  try {
    [name] = erc20.decodeFunctionResult("name", nameResponse);
  } catch {
    try {
      name = parseBytes32String(nameResponse);
    } catch {
      name = "UNKNOWN";
    }
  }

  let symbol: string;
  try {
    [symbol] = erc20.decodeFunctionResult("symbol", symbolResponse);
  } catch {
    try {
      symbol = parseBytes32String(symbolResponse);
    } catch {
      symbol = "UNKNOWN";
    }
  }

  let decimals: number;
  try {
    const [decimalsBN] = erc20.decodeFunctionResult(
      "decimals",
      decimalsResponse
    );
    decimals = decimalsBN.toNumber();
  } catch {
    decimals = 18;
  }

  return {
    name,
    symbol,
    decimals,
  };
};

export async function getNetworkMetadata(
  network: Network,
  tokens: string[]
): Promise<Record<string, TokenInfo>> {
  const provider = providers[network];
  const multicallAddress = multicallContract[network];

  const multi = new Contract(multicallAddress, multicallABI, provider);
  const erc20 = new Interface(erc20ABI);
  const calls: [string, string][] = [];
  tokens.forEach((token) => {
    calls.push([token, erc20.encodeFunctionData("name", [])]);
    calls.push([token, erc20.encodeFunctionData("symbol", [])]);
    calls.push([token, erc20.encodeFunctionData("decimals", [])]);
  });
  const response = await multi.tryAggregate(false, calls);

  const tokenMetadata = tokens.reduce((acc, address, index) => {
    acc[address] = {
      address,
      chainId: chainIdMap[network],
      ...decodeERC20Metadata(
        response[3 * index][1],
        response[3 * index + 1][1],
        response[3 * index + 2][1]
      ),
    };

    return acc;
  }, {} as Record<string, TokenInfo>);

  return tokenMetadata;
}
