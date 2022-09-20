import Big from "big.js";
import {
  BTCIDS,
  BTC_STABLE_POOL_ID,
  BTC_STABLE_POOL_INDEX,
  CUSDIDS,
  CUSD_STABLE_POOL_ID,
  CUSD_STABLE_POOL_INDEX,
  LINEARIDS,
  LINEAR_POOL_ID,
  LINEAR_POOL_INDEX,
  NEARXIDS,
  NEAX_POOL_ID,
  NEAX_POOL_INDEX,
  STABLE_POOL_ID,
  STABLE_POOL_USN_ID,
  STABLE_TOKEN_IDS,
  STABLE_TOKEN_USN_IDS,
  STNEARIDS,
  STNEAR_POOL_ID,
  STNEAR_POOL_INDEX,
} from "./utils";
import getConfig from "./config";
import { BN } from "bn.js";

const config = getConfig();

export const BLACKLIST_POOL_IDS = config.BLACKLIST_POOL_IDS;
export const STABLE_TOKEN_INDEX = config.STABLE_TOKEN_INDEX;
export const STABLE_TOKEN_USN_INDEX = config.STABLE_TOKEN_USN_INDEX;

export interface Transaction {
  receiverId: string;
  functionCalls: RefFiFunctionCallOptions[];
}

export interface RefFiFunctionCallOptions extends RefFiViewFunctionOptions {
  gas?: string;
  amount?: string;
}

export interface RefFiViewFunctionOptions {
  methodName: string;
  args?: object;
}

export interface TokenMetadata {
  id: string;
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
  ref?: number | string;
  near?: number | string;
  aurora?: number | string;
  total?: number;
  onRef?: boolean;
  onTri?: boolean;
  amountLabel?: string;
  amount?: number;
  nearNonVisible?: number | string;
}

export interface FTStorageBalance {
  total: string;
  available: string;
}

export interface RefFiViewFunctionOptions {
  methodName: string;
  args?: object;
}

export interface SwapOptions {
  tokenIn: TokenMetadata;
  tokenInAmount: string;
  tokenOut: TokenMetadata;
  slippageTolerance: number;
  setLoadingData?: (loading: boolean) => void;
  loadingData?: boolean;
  loadingTrigger?: boolean;
  setLoadingTrigger?: (loadingTrigger: boolean) => void;
  stablePool?: StablePool;
  loadingPause?: boolean;
  setLoadingPause?: (pause: boolean) => void;
  swapMode?: SWAP_MODE;
  reEstimateTrigger?: boolean;
  supportLedger?: boolean;
  requestingTrigger?: boolean;
  requested?: boolean;
  setRequested?: (requested?: boolean) => void;
  setRequestingTrigger?: (requestingTrigger?: boolean) => void;
}

export interface SwapOptions1 {
  useNearBalance?: boolean;
  swapsToDo: EstimateSwapView[];
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountIn: string;
  slippageTolerance: number;
}

export interface StablePool {
  id: number;
  token_account_ids: string[];
  decimals: number[];
  amounts: string[];
  c_amounts: string[];
  total_fee: number;
  shares_total_supply: string;
  amp: number;
  rates: string[];
}

export enum SWAP_MODE {
  NORMAL = "normal",
  STABLE = "stable",
}

export interface Pool {
  id: number;
  tokenIds: string[];
  supplies: { [key: string]: string };
  fee: number;
  shareSupply: string;
  tvl: number;
  token0_ref_price: string;
  partialAmountIn?: string;
  Dex?: string;
  rates?: {
    [id: string]: string;
  };
}

export interface EstimateSwapView {
  estimate: string;
  pool: Pool;
  intl?: any;
  dy?: string;
  status?: PoolMode;
  token?: TokenMetadata;
  noFeeAmountOut?: string;
  inputToken?: string;
  outputToken?: string;
  nodeRoute?: string[];
  tokens?: TokenMetadata[];
  routeInputToken?: string;
  route?: RoutePool[];
  allRoutes?: RoutePool[][];
  allNodeRoutes?: string[][];
  totalInputAmount?: string;
}

export interface RoutePool {
  amounts: string[];
  fee: number;
  id: number;
  reserves: ReservesMap;
  shares: string;
  token0_ref_price: string;
  token1Id: string;
  token1Supply: string;
  token2Id: string;
  token2Supply: string;
  updateTime: number;
  partialAmountIn?: string | number | Big;
  gamma_bps?: Big;
  supplies?: ReservesMap;
  tokenIds?: string[];
  x?: string;
  y?: string;
}

export interface ReservesMap {
  [index: string]: string;
}

export enum PoolMode {
  PARALLEL = "parallel swap",
  SMART = "smart routing",
  SMART_V2 = "stableSmart",
  STABLE = "stable swap",
}

export interface CreateAccountAction {
  type: "CreateAccount";
}
export interface DeployContractAction {
  type: "DeployContract";
  params: {
    code: Uint8Array;
  };
}
export interface FunctionCallAction {
  type: "FunctionCall";
  params: {
    methodName: string;
    args: object;
    gas: string;
    deposit: string;
  };
}
export interface TransferAction {
  type: "Transfer";
  params: {
    deposit: string;
  };
}
export interface StakeAction {
  type: "Stake";
  params: {
    stake: string;
    publicKey: string;
  };
}
export declare type AddKeyPermission =
  | "FullAccess"
  | {
      receiverId: string;
      allowance?: string;
      methodNames?: Array<string>;
    };
export interface AddKeyAction {
  type: "AddKey";
  params: {
    publicKey: string;
    accessKey: {
      nonce?: number;
      permission: AddKeyPermission;
    };
  };
}
export interface DeleteKeyAction {
  type: "DeleteKey";
  params: {
    publicKey: string;
  };
}
export interface DeleteAccountAction {
  type: "DeleteAccount";
  params: {
    beneficiaryId: string;
  };
}

export declare type Action =
  | CreateAccountAction
  | DeployContractAction
  | FunctionCallAction
  | TransferAction
  | StakeAction
  | AddKeyAction
  | DeleteKeyAction
  | DeleteAccountAction;

export const ALL_STABLE_POOL_IDS = [
  STABLE_POOL_ID,
  STABLE_POOL_USN_ID,
  BTC_STABLE_POOL_ID,
  STNEAR_POOL_ID,
  CUSD_STABLE_POOL_ID,
  LINEAR_POOL_ID,
  NEAX_POOL_ID,
]
  .filter(_ => _)
  .map(id => id.toString());

export const isStablePool = (id: string | number) => {
  return ALL_STABLE_POOL_IDS.map(id => id.toString()).includes(id.toString());
};

export const ONLY_ZEROS = /^0*\.?0*$/;

export interface EstimateSwapOptions {
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountIn: string;
  intl?: any;
  setLoadingData?: (loading: boolean) => void;
  loadingTrigger?: boolean;
  setLoadingTrigger?: (loadingTrigger: boolean) => void;
  swapMode?: SWAP_MODE;
  supportLedger?: boolean;
  swapPro?: boolean;
  setSwapsToDoTri?: (todos: EstimateSwapView[]) => void;
  setSwapsToDoRef?: (todos: EstimateSwapView[]) => void;
}

export const DEFAULT_PAGE_LIMIT = 100;

export interface GetPoolOptions {
  tokenInId: string;
  tokenOutId: string;
  amountIn?: string;

  crossSwap?: boolean;
}

export interface PoolRPCView {
  id: number;
  token_account_ids: string[];
  token_symbols: string[];
  amounts: string[];
  pool_kind?: string;
  total_fee: number;
  shares_total_supply: string;
  tvl: number;
  token0_ref_price: string;
  share: string;
  decimalsHandled?: boolean;
  tokens_meta_data?: TokenMetadata[];
}

export interface StorageDepositActionOptions {
  accountId?: string;
  registrationOnly?: boolean;
  amount: string;
}

export interface WithdrawActionOptions {
  tokenId: string;
  amount: string;
  unregister?: boolean;
  singleTx?: boolean;
}

export const getStablePoolKey = (id: string) => `STABLE_POOL_VALUE_${id}`;
export const getStablePoolInfoKey = (id: string) =>
  `REF_FI_STABLE_Pool_INFO_VALUE_${id}`;
export const STABLE_LP_TOKEN_DECIMALS = 18;
export const RATED_POOL_LP_TOKEN_DECIMALS = 24;

export const isStableToken = (id: string) => {
  return (
    STABLE_TOKEN_IDS.includes(id) ||
    STABLE_TOKEN_USN_IDS.includes(id) ||
    BTCIDS.includes(id) ||
    STNEARIDS.includes(id) ||
    CUSDIDS.includes(id) ||
    LINEARIDS.includes(id) ||
    NEARXIDS.includes(id)
  );
};

export const getStableTokenIndex = (stable_pool_id: string | number) => {
  const id = stable_pool_id.toString();
  switch (id) {
    case STABLE_POOL_ID.toString():
      return STABLE_TOKEN_INDEX;
    case STABLE_POOL_USN_ID.toString():
      return STABLE_TOKEN_USN_INDEX;
    case BTC_STABLE_POOL_ID:
      return BTC_STABLE_POOL_INDEX;
    case STNEAR_POOL_ID:
      return STNEAR_POOL_INDEX;
    case CUSD_STABLE_POOL_ID:
      return CUSD_STABLE_POOL_INDEX;
    case LINEAR_POOL_ID:
      return LINEAR_POOL_INDEX;
    case NEAX_POOL_ID:
      return NEAX_POOL_INDEX;
  }
};

export const FEE_DIVISOR = 10000;
export const ONE_MORE_DEPOSIT_AMOUNT = "0.01";

export interface AccountStorageView {
  total: string;
  available: string;
}
export const ACCOUNT_MIN_STORAGE_AMOUNT = "0.005";
export const MIN_DEPOSIT_PER_TOKEN = new BN("5000000000000000000000");
export const STORAGE_PER_TOKEN = "0.005";
export const NEW_ACCOUNT_STORAGE_COST = "0.00125";
