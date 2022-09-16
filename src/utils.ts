import {
  keyStores,
  Near,
  utils,
  transactions as Transactions,
  providers,
  connect,
} from "near-api-js";
import axios from "axios";
import * as math from "mathjs";
import Big from "big.js";
import BN from "bn.js";
import sha256 from "js-sha256";
import moment from "moment";
import _, { rearg } from "lodash";
import { Transaction as WSTransaction } from "@near-wallet-selector/core";

import {
  AccountStorageView,
  ACCOUNT_MIN_STORAGE_AMOUNT,
  ALL_STABLE_POOL_IDS,
  BLACKLIST_POOL_IDS,
  DEFAULT_PAGE_LIMIT,
  EstimateSwapOptions,
  EstimateSwapView,
  FEE_DIVISOR,
  FTStorageBalance,
  GetPoolOptions,
  getStablePoolInfoKey,
  getStablePoolKey,
  getStableTokenIndex,
  isStablePool,
  isStableToken,
  MIN_DEPOSIT_PER_TOKEN,
  NEW_ACCOUNT_STORAGE_COST,
  ONE_MORE_DEPOSIT_AMOUNT,
  ONLY_ZEROS,
  Pool,
  PoolMode,
  PoolRPCView,
  RATED_POOL_LP_TOKEN_DECIMALS,
  RefFiFunctionCallOptions,
  RefFiViewFunctionOptions,
  StablePool,
  STABLE_LP_TOKEN_DECIMALS,
  STORAGE_PER_TOKEN,
  SwapOptions,
  SwapOptions1,
  SWAP_MODE,
  TokenMetadata,
  Transaction,
} from "./near";

import getConfig, {
  ACCOUNT_ID,
  ONE_YOCTO_NEAR,
  STORAGE_TO_REGISTER_WITH_MFT,
  getExtraStablePoolConfig,
  PRIVATE_KEY,
} from "./config";
import SpecialWallet from "./SpecialWallet";
import BigNumber from "bignumber.js";
import { AccountView } from "near-api-js/lib/providers/provider";
import { useDepositableBalance } from "./hooks";

const config = getConfig();

export const POOL_TOKEN_REFRESH_INTERVAL = config.POOL_TOKEN_REFRESH_INTERVAL;

export const REF_FI_CONTRACT_ID = config.REF_FI_CONTRACT_ID;
export const REF_FARM_BOOST_CONTRACT_ID = config.REF_FARM_BOOST_CONTRACT_ID;
export const STABLE_POOL_ID = config.STABLE_POOL_ID;
export const PROVIDER = config.nodeUrl;

export const STABLE_POOL_USN_ID = config.STABLE_POOL_USN_ID;
export const STABLE_TOKEN_IDS = config.STABLE_TOKEN_IDS;
export const STABLE_TOKEN_USN_IDS = config.STABLE_TOKEN_USN_IDS;
export const { WRAP_NEAR_CONTRACT_ID } = getConfig();
export const keyStore = new keyStores.InMemoryKeyStore();
export const {
  BTCIDS,
  CUSDIDS,
  BTC_STABLE_POOL_ID,
  CUSD_STABLE_POOL_ID,
  STNEAR_POOL_ID,
  STNEARIDS,
  BTC_STABLE_POOL_INDEX,
  CUSD_STABLE_POOL_INDEX,
  STNEAR_POOL_INDEX,
  LINEARIDS,
  LINEAR_POOL_INDEX,
  LINEAR_POOL_ID,
  NEAX_POOL_ID,
  NEAX_POOL_INDEX,
  NEARXIDS,
} = getExtraStablePoolConfig();
//@ts-ignore
// keyStore?.reKey = () => {};

console.log("config=======", config);

const near = new Near({
  keyStore,
  headers: {},
  ...config,
});

export const wallet = new SpecialWallet(near, REF_FARM_BOOST_CONTRACT_ID);
export const refFiViewFunction = async ({
  methodName,
  args,
}: RefFiViewFunctionOptions) => {
  try {
    const account = await near.account(ACCOUNT_ID);

    let data = await account.viewFunction(REF_FI_CONTRACT_ID, methodName, args);
    return data;
  } catch (error) {
    console.log("er", error);
  }
};

export const getGlobalTokens = async () => {
  const tokensIds: string[] = await refFiViewFunction({
    methodName: "get_whitelisted_tokens",
  });
  const account = await near.account(ACCOUNT_ID);

  let tokensInfo: any = [];

  await Promise.all(
    tokensIds.map(async tk => {
      let data = await getTokensMetaData(tk, account);
      tokensInfo.push(data);
    })
  );
  return tokensInfo;
};

export const getUserTokens = async () => {
  try {
    const { data: tokensIds } = await axios.get(
      `https://api.kitwallet.app/account/${ACCOUNT_ID}/likelyTokens`
    );
    // const tokensIds: string[] = await refFiViewFunction({
    //   methodName: "get_user_whitelisted_tokens",
    //   args: { account_id: ACCOUNT_ID },
    // });

    const account = await near.account(ACCOUNT_ID);

    let tokensInfo: any = [];

    let unSupportedTokens = ["v2.ref-finance.near"];

    let filtered = tokensIds.filter(
      (tk: string) => !unSupportedTokens.includes(tk)
    );
    console.log("filtered", filtered);

    filtered.length > 0 &&
      (await Promise.all(
        filtered.map(async (tk: string) => {
          let data = await getTokensMetaData(tk, account, "user_holdings");
          tokensInfo.push(data);
        })
      ));

    console.log("tokensInfo", tokensInfo);

    return tokensInfo.filter((tk: any) => tk.balance != 0);
  } catch (error) {
    console.log("ee====", error);
  }
};

const getTokensMetaData = async (token: string, account: any, mode = "") => {
  let tokenInfo = await account.viewFunction(token, "ft_metadata");

  let obj: any = {
    id: token,
    name: tokenInfo.name,
    symbol: tokenInfo.symbol,

    contractName: token,
    decimals: tokenInfo.decimals,
  };
  if (mode === "user_holdings") {
    let balance = await account.viewFunction(token, "ft_balance_of", {
      account_id: ACCOUNT_ID,
    });

    if (token === WRAP_NEAR_CONTRACT_ID) {
      getAccountNearBalance(ACCOUNT_ID).then(
        ({ available }: any) =>
          (obj.balance = Number(available) / 10 ** tokenInfo.decimals)
      );
    }

    obj.balance = balance / 10 ** tokenInfo.decimals;
  }

  return obj;
};

export const ftGetStorageBalance = (
  tokenId: string
): Promise<FTStorageBalance | null> => {
  return ftViewFunction(tokenId, {
    methodName: "storage_balance_of",
    args: { account_id: ACCOUNT_ID },
  });
};

export const ftViewFunction = (
  tokenId: string,
  { methodName, args }: RefFiViewFunctionOptions
) => {
  return wallet.account().viewFunction(tokenId, methodName, args);
};

export const convertToPercentDecimal = (percent: number) => {
  return math.divide(percent, 100);
};

export const percentOf = (percent: number, num: number | string) => {
  return math.evaluate(`${convertToPercentDecimal(percent)} * ${num}`);
};

export const percentLess = (percent: number, num: number | string) => {
  return math.format(math.evaluate(`${num} - ${percentOf(percent, num)}`), {
    notation: "fixed",
  });
};

export const swap = async ({
  useNearBalance,
  tokenIn,
  tokenOut,
  swapsToDo,
  slippageTolerance,
  amountIn,
}: SwapOptions1) => {
  console.log(
    "swap",
    useNearBalance,
    tokenIn,
    tokenOut,
    swapsToDo,
    slippageTolerance,
    amountIn
  );
  if (swapsToDo) {
    if (useNearBalance) {
      await instantSwap({
        tokenIn,
        tokenOut,
        amountIn,
        swapsToDo,
        slippageTolerance,
      });
    }
  }
};

export const toReadableNumber = (
  decimals: number,
  number: string = "0"
): string => {
  if (!decimals) return number;

  const wholeStr = number.substring(0, number.length - decimals) || "0";
  const fractionStr = number
    .substring(number.length - decimals)
    .padStart(decimals, "0")
    .substring(0, decimals);

  return `${wholeStr}.${fractionStr}`.replace(/\.?0+$/, "");
};

export function scientificNotationToString(strParam: string) {
  let flag = /e/.test(strParam);
  if (!flag) return strParam;

  let sysbol = true;
  if (/e-/.test(strParam)) {
    sysbol = false;
  }

  const negative = Number(strParam) < 0 ? "-" : "";

  let index = Number(strParam.match(/\d+$/)[0]);

  let basis = strParam.match(/[\d\.]+/)[0];

  const ifFraction = basis.includes(".");

  let wholeStr;
  let fractionStr;

  if (ifFraction) {
    wholeStr = basis.split(".")[0];
    fractionStr = basis.split(".")[1];
  } else {
    wholeStr = basis;
    fractionStr = "";
  }

  if (sysbol) {
    if (!ifFraction) {
      return negative + wholeStr.padEnd(index + wholeStr.length, "0");
    } else {
      if (fractionStr.length <= index) {
        return negative + wholeStr + fractionStr.padEnd(index, "0");
      } else {
        return (
          negative +
          wholeStr +
          fractionStr.substring(0, index) +
          "." +
          fractionStr.substring(index)
        );
      }
    }
  } else {
    if (!ifFraction)
      return (
        negative +
        wholeStr.padStart(index + wholeStr.length, "0").replace(/^0/, "0.")
      );
    else {
      return (
        negative +
        wholeStr.padStart(index + wholeStr.length, "0").replace(/^0/, "0.") +
        fractionStr
      );
    }
  }
}

export const round = (decimals: number, minAmountOut: string) => {
  return Number.isInteger(Number(minAmountOut))
    ? minAmountOut
    : Math.ceil(
        Math.round(Number(minAmountOut) * Math.pow(10, decimals)) /
          Math.pow(10, decimals)
      ).toString();
};

export const toNonDivisibleNumber = (
  decimals: number,
  number: string
): string => {
  if (decimals === null || decimals === undefined) return number;
  const [wholePart, fracPart = ""] = number.split(".");

  return `${wholePart}${fracPart.padEnd(decimals, "0").slice(0, decimals)}`
    .replace(/^0+/, "")
    .padStart(1, "0");
};

export const nearDepositTransaction = (amount: string) => {
  const transaction: Transaction = {
    receiverId: WRAP_NEAR_CONTRACT_ID,
    functionCalls: [
      {
        methodName: "near_deposit",
        args: {},
        gas: "50000000000000",
        amount,
      },
    ],
  };

  return transaction;
};

export function separateRoutes(
  actions: EstimateSwapView[],
  outputToken: string
) {
  const res = [];
  let curRoute = [];

  for (let i in actions) {
    curRoute.push(actions[i]);
    if (actions[i].outputToken === outputToken) {
      res.push(curRoute);
      curRoute = [];
    }
  }

  return res;
}

export const getGas = (gas: string) =>
  gas ? new BN(gas) : new BN("100000000000000");

export const instantSwap = async ({
  tokenIn,
  tokenOut,
  amountIn,
  swapsToDo,
  slippageTolerance,
}: SwapOptions1) => {
  console.log("instantSwap");
  if (swapsToDo.every(todo => todo.pool.Dex !== "tri")) {
    console.log("IF========================");
    return nearInstantSwap({
      tokenIn,
      tokenOut,
      amountIn,
      swapsToDo,
      slippageTolerance,
    });
  } else {
    console.log("ELSE=========");
  }
};

export const nearInstantSwap = async ({
  tokenIn,
  tokenOut,
  amountIn,
  swapsToDo,
  slippageTolerance,
}: // minAmountOut,
SwapOptions1) => {
  const transactions: Transaction[] = [];
  const tokenInActions: RefFiFunctionCallOptions[] = [];
  const tokenOutActions: RefFiFunctionCallOptions[] = [];

  console.log("nearInstantSwap");

  const registerToken = async (token: TokenMetadata) => {
    const tokenRegistered = await ftGetStorageBalance(token.id).catch(() => {
      throw new Error(`${token.id} doesn't exist.`);
    });

    if (tokenRegistered === null) {
      tokenOutActions.push({
        methodName: "storage_deposit",
        args: {
          registration_only: true,
          account_id: ACCOUNT_ID,
        },
        gas: "30000000000000",
        amount: STORAGE_TO_REGISTER_WITH_MFT,
      });

      transactions.push({
        receiverId: token.id,
        functionCalls: tokenOutActions,
      });
    }
  };

  const isParallelSwap = swapsToDo.every(
    estimate => estimate.status === PoolMode.PARALLEL
  );
  const isSmartRouteV1Swap = swapsToDo.every(
    estimate => estimate.status === PoolMode.SMART
  );

  console.log("isParallelSwap", isParallelSwap, isSmartRouteV1Swap);

  if (isParallelSwap) {
    const swapActions = swapsToDo.map(s2d => {
      let minTokenOutAmount = s2d.estimate
        ? percentLess(slippageTolerance, s2d.estimate)
        : "0";
      let allocation = toReadableNumber(
        tokenIn.decimals,
        scientificNotationToString(s2d.pool.partialAmountIn)
      );

      return {
        pool_id: s2d.pool.id,
        token_in: tokenIn.id,
        token_out: tokenOut.id,
        amount_in: round(
          tokenIn.decimals,
          toNonDivisibleNumber(tokenIn.decimals, allocation)
        ),
        min_amount_out: round(
          tokenOut.decimals,
          toNonDivisibleNumber(tokenOut.decimals, minTokenOutAmount)
        ),
      };
    });

    await registerToken(tokenOut);

    tokenInActions.push({
      methodName: "ft_transfer_call",
      args: {
        receiver_id: REF_FI_CONTRACT_ID,
        amount: toNonDivisibleNumber(tokenIn.decimals, amountIn),
        msg: JSON.stringify({
          force: 0,
          actions: swapActions,
        }),
      },
      gas: "180000000000000",
      amount: ONE_YOCTO_NEAR,
      // deposit: '1',
    });

    transactions.push({
      receiverId: tokenIn.id,
      functionCalls: tokenInActions,
    });
  } else if (isSmartRouteV1Swap) {
    //making sure all actions get included for hybrid stable smart.
    await registerToken(tokenOut);
    var actionsList = [];
    // let allSwapsTokens = swapsToDo.map((s) => [s.inputToken, s.outputToken]); // to get the hop tokens
    let amountInInt = new Big(amountIn)
      .times(new Big(10).pow(tokenIn.decimals))
      .toString();
    let swap1 = swapsToDo[0];
    actionsList.push({
      pool_id: swap1.pool.id,
      token_in: swap1.inputToken,
      token_out: swap1.outputToken,
      amount_in: amountInInt,
      min_amount_out: "0",
    });
    let swap2 = swapsToDo[1];
    actionsList.push({
      pool_id: swap2.pool.id,
      token_in: swap2.inputToken,
      token_out: swap2.outputToken,
      min_amount_out: round(
        tokenOut.decimals,
        toNonDivisibleNumber(
          tokenOut.decimals,
          percentLess(slippageTolerance, swapsToDo[1].estimate)
        )
      ),
    });

    transactions.push({
      receiverId: tokenIn.id,
      functionCalls: [
        {
          methodName: "ft_transfer_call",
          args: {
            receiver_id: REF_FI_CONTRACT_ID,
            amount: toNonDivisibleNumber(tokenIn.decimals, amountIn),
            msg: JSON.stringify({
              force: 0,
              actions: actionsList,
            }),
          },
          gas: "180000000000000",
          amount: ONE_YOCTO_NEAR,
        },
      ],
    });
  } else {
    //making sure all actions get included.
    await registerToken(tokenOut);
    var actionsList = [];
    let allSwapsTokens = swapsToDo.map(s => [s.inputToken, s.outputToken]); // to get the hop tokens
    for (var i in allSwapsTokens) {
      let swapTokens = allSwapsTokens[i];
      if (swapTokens[0] == tokenIn.id && swapTokens[1] == tokenOut.id) {
        // parallel, direct hop route.
        actionsList.push({
          pool_id: swapsToDo[i].pool.id,
          token_in: tokenIn.id,
          token_out: tokenOut.id,
          amount_in: swapsToDo[i].pool.partialAmountIn,
          min_amount_out: round(
            tokenOut.decimals,
            toNonDivisibleNumber(
              tokenOut.decimals,
              percentLess(slippageTolerance, swapsToDo[i].estimate)
            )
          ),
        });
      } else if (swapTokens[0] == tokenIn.id) {
        // first hop in double hop route
        //TODO -- put in a check to make sure this first hop matches with the next (i+1) hop as a second hop.
        actionsList.push({
          pool_id: swapsToDo[i].pool.id,
          token_in: swapTokens[0],
          token_out: swapTokens[1],
          amount_in: swapsToDo[i].pool.partialAmountIn,
          min_amount_out: "0",
        });
      } else {
        // second hop in double hop route.
        //TODO -- put in a check to make sure this second hop matches with the previous (i-1) hop as a first hop.
        actionsList.push({
          pool_id: swapsToDo[i].pool.id,
          token_in: swapTokens[0],
          token_out: swapTokens[1],
          min_amount_out: round(
            tokenOut.decimals,
            toNonDivisibleNumber(
              tokenOut.decimals,
              percentLess(slippageTolerance, swapsToDo[i].estimate)
            )
          ),
        });
      }
    }

    transactions.push({
      receiverId: tokenIn.id,
      functionCalls: [
        {
          methodName: "ft_transfer_call",
          args: {
            receiver_id: REF_FI_CONTRACT_ID,
            amount: toNonDivisibleNumber(tokenIn.decimals, amountIn),
            msg: JSON.stringify({
              force: 0,
              actions: actionsList,
            }),
          },
          gas: "180000000000000",
          amount: ONE_YOCTO_NEAR,
        },
      ],
    });
  }

  if (tokenIn.id === WRAP_NEAR_CONTRACT_ID) {
    transactions.unshift(nearDepositTransaction(amountIn));
  }
  if (tokenOut.id === WRAP_NEAR_CONTRACT_ID) {
    let outEstimate = new Big(0);
    const routes = separateRoutes(swapsToDo, tokenOut.id);

    const bigEstimate = routes.reduce((acc, cur) => {
      const curEstimate = cur[cur.length - 1].estimate;
      return acc.plus(curEstimate);
    }, outEstimate);

    const minAmountOut = percentLess(
      slippageTolerance,

      scientificNotationToString(bigEstimate.toString())
    );

    transactions.push(nearWithdrawTransaction(minAmountOut));
  }

  if (tokenIn.id === WRAP_NEAR_CONTRACT_ID) {
    const registered = await ftGetStorageBalance(WRAP_NEAR_CONTRACT_ID);
    if (registered === null) {
      transactions.unshift({
        receiverId: WRAP_NEAR_CONTRACT_ID,
        functionCalls: [registerAccountOnToken()],
      });
    }
  }

  return executeMultipleTransactions(transactions);
};

export const executeMultipleTransactions = async (
  transactions: Transaction[],
  callbackUrl?: string
) => {
  try {
    console.log("executeMultipleTransactions", transactions);
    const keyPair = utils.key_pair.KeyPairEd25519.fromString(PRIVATE_KEY);
    await keyStore.setKey(config.networkId, ACCOUNT_ID, keyPair);
    const near = new Near({ ...config, keyStore });
    const account = await near.account(ACCOUNT_ID);

    transactions.forEach(async transaction => {
      transaction.functionCalls.map(async fc => {
        await account.functionCall({
          contractId: transaction.receiverId,
          methodName: fc.methodName,
          args: fc.args,
          attachedDeposit: new BN(
            utils.format.parseNearAmount(fc.amount || "0")
          ),
          gas: new BN(getGas(fc.gas).toNumber().toFixed()),
        });
      });
    });
  } catch (error) {
    console.log("ERROR======", error);
  }
};

export const nearWithdrawTransaction = (amount: string) => {
  const transaction: Transaction = {
    receiverId: WRAP_NEAR_CONTRACT_ID,
    functionCalls: [
      {
        methodName: "near_withdraw",
        args: { amount: utils.format.parseNearAmount(amount) },
        amount: ONE_YOCTO_NEAR,
      },
    ],
  };
  return transaction;
};

export const registerAccountOnToken = () => {
  return {
    methodName: "storage_deposit",
    args: {
      registration_only: true,
      account_id: ACCOUNT_ID,
    },
    gas: "30000000000000",
    amount: STORAGE_TO_REGISTER_WITH_MFT,
  };
};

export const estimateSwap = async ({
  tokenIn,
  tokenOut,
  amountIn,
  swapMode,
  supportLedger,
  swapPro,
  setSwapsToDoRef,
  setSwapsToDoTri,
}: EstimateSwapOptions): Promise<EstimateSwapView[]> => {
  const parsedAmountIn = toNonDivisibleNumber(tokenIn.decimals, amountIn);
  console.log("parsedAmountIn", parsedAmountIn);

  if (ONLY_ZEROS.test(parsedAmountIn)) throw new Error("Errr");

  const throwNoPoolError = () => {
    throw new Error("Error");
  };

  let pools = (
    await getPoolsByTokens({
      tokenInId: tokenIn.id,
      tokenOutId: tokenOut.id,
      amountIn: parsedAmountIn,
      crossSwap: swapPro,
    })
  ).filter(p => {
    return getLiquidity(p, tokenIn, tokenOut) > 0;
  });

  console.log("pools", pools);

  let { supportLedgerRes, triTodos, refTodos } = await getOneSwapActionResult(
    swapPro,
    pools,
    tokenIn,
    tokenOut,
    supportLedger,
    swapMode,
    throwNoPoolError,
    amountIn,
    parsedAmountIn
  );
  // ref smart routing

  if (supportLedger) {
    if (swapPro) {
      setSwapsToDoRef(refTodos);
      setSwapsToDoTri(triTodos);
    }

    return supportLedgerRes;
  }
};

export const getTotalPools = async () => {
  return refFiViewFunction({
    methodName: "get_number_of_pools",
  });
};

export const parsePool = (pool: PoolRPCView, id?: number): Pool => ({
  id: Number(id >= 0 ? id : pool.id),
  tokenIds: pool.token_account_ids,
  supplies: pool.amounts.reduce(
    (acc: { [tokenId: string]: string }, amount: string, i: number) => {
      acc[pool.token_account_ids[i]] = amount;
      return acc;
    },
    {}
  ),
  fee: pool.total_fee,
  shareSupply: pool.shares_total_supply,
  tvl: pool.tvl,
  token0_ref_price: pool.token0_ref_price,
});

export const getAllPools = async (
  page: number = 1,
  perPage: number = DEFAULT_PAGE_LIMIT
): Promise<Pool[]> => {
  const index = (page - 1) * perPage;

  const poolData: PoolRPCView[] = await refFiViewFunction({
    methodName: "get_pools",
    args: { from_index: index, limit: perPage },
  });

  return poolData.map((rawPool, i) => parsePool(rawPool, i + index));
};

export const getPoolsByTokens = async ({
  tokenInId,
  tokenOutId,
  crossSwap,
}: GetPoolOptions): Promise<Pool[]> => {
  let filtered_pools;

  const totalPools = await getTotalPools();
  console.log("totalPools", totalPools, tokenInId, tokenOutId, crossSwap);
  const pages = Math.ceil(totalPools / DEFAULT_PAGE_LIMIT);
  const pools = (
    await Promise.all([...Array(pages)].map((_, i) => getAllPools(i + 1)))
  )
    .flat()
    .map(p => ({ ...p, Dex: "ref" }));

  let triPools;

  filtered_pools = pools
    .concat(triPools || [])
    .filter(isNotStablePool)
    .filter(filterBlackListPools);

  console.log("filtered_pools", filtered_pools);

  filtered_pools = filtered_pools.filter(
    p => p.supplies[tokenInId] && p.supplies[tokenOutId]
  );
  console.log(filtered_pools);
  await getAllStablePoolsFromCache();

  // @ts-ignore
  return filtered_pools.filter(p => crossSwap || !p?.Dex || p.Dex !== "tri");
};

export const getLiquidity = (
  pool: Pool,
  tokenIn: TokenMetadata,
  tokenOut: TokenMetadata
) => {
  const amount1 = toReadableNumber(tokenIn.decimals, pool.supplies[tokenIn.id]);
  const amount2 = toReadableNumber(
    tokenOut.decimals,
    pool.supplies[tokenOut.id]
  );

  const lp = new Big(amount1).times(new Big(amount2));

  return Number(lp);
};

export const getOneSwapActionResult = async (
  swapPro: boolean,
  poolsOneSwap: Pool[],
  tokenIn: TokenMetadata,
  tokenOut: TokenMetadata,
  supportLedger: boolean,
  swapMode: SWAP_MODE,
  throwNoPoolError: (p?: any) => void,
  amountIn: string,
  parsedAmountIn: string
) => {
  const { allStablePoolsById, allStablePools, allStablePoolsInfo } =
    await getAllStablePoolsFromCache();

  let supportLedgerRes;

  /**
   * for swap pro, we need to calculate the result on tri pool
   * to do price comparison on tri result and ref result
   *
   */

  let triTodos;
  let refTodos;
  let pools: Pool[] = poolsOneSwap;

  if (isStableToken(tokenIn.id) && isStableToken(tokenOut.id)) {
    pools = pools.concat(
      getStablePoolThisPair({
        tokenInId: tokenIn.id,
        tokenOutId: tokenOut.id,
        stablePools: allStablePools,
      })
    );
  }

  /**s
   *  single swap action estimate for support ledger and swap pro mode
   *
   */
  if (supportLedger || swapPro) {
    if (swapMode === SWAP_MODE.STABLE) {
      pools = getStablePoolThisPair({
        tokenInId: tokenIn.id,
        tokenOutId: tokenOut.id,
        stablePools: allStablePools,
      });
    }
    if (pools.length === 0 && supportLedger) {
      throwNoPoolError();
    }

    if (pools.length > 0) {
      const bestPricePool =
        pools.length === 1
          ? pools[0]
          : _.maxBy(pools, p => {
              if (isStablePool(p.id)) {
                return Number(
                  getStablePoolEstimate({
                    tokenIn,
                    tokenOut,
                    stablePool: allStablePoolsById[p.id][0],
                    stablePoolInfo: allStablePoolsById[p.id][1],
                    amountIn,
                  }).estimate
                );
              }
              return Number(
                getSinglePoolEstimate(tokenIn, tokenOut, p, parsedAmountIn)
                  .estimate
              );
            });

      const estimateRes = await getPoolEstimate({
        tokenIn,
        tokenOut,
        amountIn: parsedAmountIn,
        Pool: bestPricePool,
      });

      const res = [
        {
          ...estimateRes,
          status: PoolMode.PARALLEL,
          routeInputToken: tokenIn.id,
          totalInputAmount: parsedAmountIn,
          pool: {
            ...bestPricePool,
            partialAmountIn: parsedAmountIn,
          },
          tokens: [tokenIn, tokenOut],
          inputToken: tokenIn.id,
          outputToken: tokenOut.id,
        },
      ];

      supportLedgerRes = res;
    }

    // get result on tri pools but just one swap action
    if (swapPro) {
      // find tri pool for this pair
      const triPoolThisPair = pools.find(
        p =>
          p.Dex === "tri" &&
          p.tokenIds &&
          p.tokenIds.includes(tokenIn.id) &&
          p.tokenIds.includes(tokenOut.id)
      );

      if (triPoolThisPair) {
        const triPoolEstimateRes = getSinglePoolEstimate(
          tokenIn,
          tokenOut,
          triPoolThisPair,
          parsedAmountIn
        );

        triTodos = [
          {
            ...triPoolEstimateRes,
            status: PoolMode.PARALLEL,
            routeInputToken: tokenIn.id,
            totalInputAmount: parsedAmountIn,
            pool: {
              ...triPoolThisPair,
              partialAmountIn: parsedAmountIn,
            },
            tokens: [tokenIn, tokenOut],
            inputToken: tokenIn.id,
            outputToken: tokenOut.id,
          },
        ];
        const refPools = pools.filter(p => p.Dex !== "tri");

        const refPoolThisPair =
          refPools.length === 1
            ? refPools[0]
            : _.maxBy(refPools, p => {
                if (isStablePool(p.id)) {
                  return Number(
                    getStablePoolEstimate({
                      tokenIn,
                      tokenOut,
                      stablePoolInfo: allStablePoolsById[p.id][1],
                      stablePool: allStablePoolsById[p.id][0],
                      amountIn,
                    }).estimate
                  );
                } else
                  return Number(
                    getSinglePoolEstimate(tokenIn, tokenOut, p, parsedAmountIn)
                      .estimate
                  );
              });

        if (refPoolThisPair) {
          const refPoolEstimateRes = await getPoolEstimate({
            tokenIn,
            tokenOut,
            amountIn: parsedAmountIn,
            Pool: refPoolThisPair,
          });

          refTodos = [
            {
              ...refPoolEstimateRes,
              status: PoolMode.PARALLEL,
              routeInputToken: tokenIn.id,
              totalInputAmount: parsedAmountIn,
              pool: {
                ...refPoolThisPair,
                partialAmountIn: parsedAmountIn,
              },
              tokens: [tokenIn, tokenOut],
              inputToken: tokenIn.id,
              outputToken: tokenOut.id,
            },
          ];
        }
      }
    }
  }

  return {
    supportLedgerRes,
    triTodos,
    refTodos,
  };
};

export const getStablePoolFromCache = async (id?: string) => {
  const stable_pool_id = id || STABLE_POOL_ID.toString();

  const pool_key = getStablePoolKey(stable_pool_id);

  const info = getStablePoolInfoKey(stable_pool_id);

  const stablePoolCache = JSON.parse(localStorage.getItem(pool_key));

  const stablePoolInfoCache = JSON.parse(localStorage.getItem(info));

  const isStablePoolCached =
    stablePoolCache?.update_time &&
    Number(stablePoolCache.update_time) >
      Number(moment().unix() - Number(POOL_TOKEN_REFRESH_INTERVAL));

  const isStablePoolInfoCached =
    stablePoolInfoCache?.update_time &&
    Number(stablePoolInfoCache.update_time) >
      Number(moment().unix() - Number(POOL_TOKEN_REFRESH_INTERVAL));

  const stablePool = isStablePoolCached
    ? stablePoolCache
    : await getPool(Number(stable_pool_id));

  const stablePoolInfo = isStablePoolInfoCached
    ? stablePoolInfoCache
    : await getStablePool(Number(stable_pool_id));

  if (!isStablePoolCached) {
    localStorage.setItem(
      pool_key,
      JSON.stringify({ ...stablePool, update_time: moment().unix() })
    );
  }

  if (!isStablePoolInfoCached) {
    localStorage.setItem(
      info,
      JSON.stringify({ ...stablePoolInfo, update_time: moment().unix() })
    );
  }
  stablePool.rates = stablePoolInfo.token_account_ids.reduce(
    (acc: any, cur: any, i: number) => ({
      ...acc,
      [cur]: toReadableNumber(
        getStablePoolDecimal(stablePool.id),
        stablePoolInfo.rates[i]
      ),
    }),
    {}
  );

  return [stablePool, stablePoolInfo];
};

export const getAllStablePoolsFromCache = async () => {
  const res = await Promise.all(
    ALL_STABLE_POOL_IDS.map(id => getStablePoolFromCache(id.toString()))
  );

  const allStablePoolsById = res.reduce((pre, cur, i) => {
    return {
      ...pre,
      [cur[0].id]: cur,
    };
  }, {}) as {
    [id: string]: [Pool, StablePool];
  };
  const allStablePools = Object.values(allStablePoolsById).map(p => p[0]);
  const allStablePoolsInfo = Object.values(allStablePoolsById).map(p => p[1]);

  return {
    allStablePoolsById,
    allStablePools,
    allStablePoolsInfo,
  };
};

export const getPool = async (id: number): Promise<Pool> => {
  return refFiViewFunction({
    methodName: "get_pool",
    args: { pool_id: id },
  }).then((pool: PoolRPCView) => parsePool(pool, id));
};

export const getStablePool = async (pool_id: number): Promise<StablePool> => {
  if (isRatedPool(pool_id)) {
    const pool_info = await refFiViewFunction({
      methodName: "get_rated_pool",
      args: { pool_id },
    });

    return {
      ...pool_info,
      id: pool_id,
    };
  }

  const pool_info = await refFiViewFunction({
    methodName: "get_stable_pool",
    args: { pool_id },
  });

  return {
    ...pool_info,
    id: pool_id,
    rates: pool_info.c_amounts.map((i: any) =>
      toNonDivisibleNumber(STABLE_LP_TOKEN_DECIMALS, "1")
    ),
  };
};

export const isRatedPool = (id: string | number) => {
  return getExtraStablePoolConfig().RATED_POOLS_IDS.includes(id.toString());
};

export const getStablePoolDecimal = (id: string | number) => {
  if (isRatedPool(id)) return RATED_POOL_LP_TOKEN_DECIMALS;
  else if (isStablePool(id)) return STABLE_LP_TOKEN_DECIMALS;
};

export const getStablePoolThisPair = ({
  tokenInId,
  tokenOutId,
  stablePools,
}: {
  tokenInId: string;
  tokenOutId: string;
  stablePools: Pool[];
}) => {
  return stablePools.filter(
    p =>
      p.tokenIds.includes(tokenInId) &&
      p.tokenIds.includes(tokenOutId) &&
      tokenInId !== tokenOutId
  );
};

const getStablePoolEstimate = ({
  tokenIn,
  tokenOut,
  amountIn,
  stablePoolInfo,
  stablePool,
}: {
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountIn: string;
  stablePoolInfo: StablePool;
  stablePool: Pool;
}) => {
  const STABLE_LP_TOKEN_DECIMALS = getStablePoolDecimal(stablePool.id);

  const [amount_swapped, fee, dy] = getSwappedAmount(
    tokenIn.id,
    tokenOut.id,
    amountIn,
    stablePoolInfo
  );

  const amountOut =
    amount_swapped < 0
      ? "0"
      : toPrecision(scientificNotationToString(amount_swapped.toString()), 0);

  const dyOut =
    amount_swapped < 0
      ? "0"
      : toPrecision(scientificNotationToString(dy.toString()), 0);

  return {
    estimate: toReadableNumber(STABLE_LP_TOKEN_DECIMALS, amountOut),
    noFeeAmountOut: toReadableNumber(STABLE_LP_TOKEN_DECIMALS, dyOut),
    pool: { ...stablePool, Dex: "ref" },
    token: tokenIn,
    outputToken: tokenOut.id,
    inputToken: tokenIn.id,
  };
};

export const getSwappedAmount = (
  tokenInId: string,
  tokenOutId: string,
  amountIn: string,
  stablePool: StablePool
) => {
  const amp = stablePool.amp;
  const trade_fee = stablePool.total_fee;

  const STABLE_TOKEN_INDEX = getStableTokenIndex(stablePool.id);

  const in_token_idx = STABLE_TOKEN_INDEX[tokenInId];
  const out_token_idx = STABLE_TOKEN_INDEX[tokenOutId];

  const STABLE_LP_TOKEN_DECIMALS = getStablePoolDecimal(stablePool.id);

  const rates = stablePool.rates.map(r =>
    toReadableNumber(STABLE_LP_TOKEN_DECIMALS, r)
  );

  const base_old_c_amounts = stablePool.c_amounts.map(amount =>
    toReadableNumber(STABLE_LP_TOKEN_DECIMALS, amount)
  );

  const old_c_amounts = base_old_c_amounts
    .map((amount, i) =>
      toNonDivisibleNumber(
        STABLE_LP_TOKEN_DECIMALS,
        scientificNotationToString(
          new Big(amount || 0).times(new Big(rates[i])).toString()
        )
      )
    )
    .map(amount => Number(amount));

  const in_c_amount = Number(
    toNonDivisibleNumber(
      STABLE_LP_TOKEN_DECIMALS,
      scientificNotationToString(
        new Big(amountIn).times(new Big(rates[in_token_idx])).toString()
      )
    )
  );

  // const in_c_amount = Number(
  //   toNonDivisibleNumber(STABLE_LP_TOKEN_DECIMALS, amountIn)
  // );

  const [amount_swapped, fee, dy] = calc_swap(
    amp,
    in_token_idx,
    in_c_amount,
    out_token_idx,
    old_c_amounts,
    trade_fee
  );

  // TODO:
  return [
    amount_swapped / Number(rates[out_token_idx]),
    fee,
    dy / Number(rates[out_token_idx]),
  ];

  // return [amount_swapped, fee, dy];
};

export const calc_swap = (
  amp: number,
  in_token_idx: number,
  in_c_amount: number,
  out_token_idx: number,
  old_c_amounts: number[],
  trade_fee: number
) => {
  const y = calc_y(
    amp,
    in_c_amount + old_c_amounts[in_token_idx],
    old_c_amounts,
    in_token_idx,
    out_token_idx
  );
  const dy = old_c_amounts[out_token_idx] - y;
  const fee = tradeFee(dy, trade_fee);
  const amount_swapped = dy - fee;
  return [amount_swapped, fee, dy];
};

const tradeFee = (amount: number, trade_fee: number) => {
  return (amount * trade_fee) / FEE_DIVISOR;
};

export const calc_y = (
  amp: number,
  x_c_amount: number,
  current_c_amounts: number[],
  index_x: number,
  index_y: number
) => {
  const token_num = current_c_amounts.length;
  const ann = amp * token_num ** token_num;
  const d = calc_d(amp, current_c_amounts);
  let s = x_c_amount;
  let c = (d * d) / x_c_amount;
  for (let i = 0; i < token_num; i++) {
    if (i != index_x && i != index_y) {
      s += current_c_amounts[i];
      c = (c * d) / current_c_amounts[i];
    }
  }
  c = (c * d) / (ann * token_num ** token_num);
  const b = d / ann + s;
  let y_prev = 0;
  let y = d;
  for (let i = 0; i < 256; i++) {
    y_prev = y;
    const y_numerator = y ** 2 + c;
    const y_denominator = 2 * y + b - d;
    y = y_numerator / y_denominator;
    if (Math.abs(y - y_prev) <= 1) break;
  }

  return y;
};

export const calc_d = (amp: number, c_amounts: number[]) => {
  const token_num = c_amounts.length;
  const sum_amounts = _.sum(c_amounts);
  let d_prev = 0;
  let d = sum_amounts;
  for (let i = 0; i < 256; i++) {
    let d_prod = d;
    for (let c_amount of c_amounts) {
      d_prod = (d_prod * d) / (c_amount * token_num);
    }
    d_prev = d;
    const ann = amp * token_num ** token_num;
    const numerator = d_prev * (d_prod * token_num + ann * sum_amounts);
    const denominator = d_prev * (ann - 1) + d_prod * (token_num + 1);
    d = numerator / denominator;
    if (Math.abs(d - d_prev) <= 1) break;
  }
  return d;
};

export const toPrecision = (
  number: string,
  precision: number,
  withCommas: boolean = false,
  atLeastOne: boolean = true
): string => {
  const [whole, decimal = ""] = number.split(".");

  let str = `${withCommas ? formatWithCommas(whole) : whole}.${decimal.slice(
    0,
    precision
  )}`.replace(/\.$/, "");
  if (atLeastOne && Number(str) === 0 && str.length > 1) {
    var n = str.lastIndexOf("0");
    str = str.slice(0, n) + str.slice(n).replace("0", "1");
  }

  return str;
};

export function formatWithCommas(value: string): string {
  const pattern = /(-?\d+)(\d{3})/;
  while (pattern.test(value)) {
    value = value.replace(pattern, "$1,$2");
  }
  return value;
}

const getSinglePoolEstimate = (
  tokenIn: TokenMetadata,
  tokenOut: TokenMetadata,
  pool: Pool,
  tokenInAmount: string
) => {
  const allocation = toReadableNumber(
    tokenIn.decimals,
    scientificNotationToString(tokenInAmount)
  );

  const amount_with_fee = Number(allocation) * (FEE_DIVISOR - pool.fee);
  const in_balance = toReadableNumber(
    tokenIn.decimals,
    pool.supplies[tokenIn.id]
  );
  const out_balance = toReadableNumber(
    tokenOut.decimals,
    pool.supplies[tokenOut.id]
  );
  const estimate = new BigNumber(
    (
      (amount_with_fee * Number(out_balance)) /
      (FEE_DIVISOR * Number(in_balance) + amount_with_fee)
    ).toString()
  ).toFixed();

  return {
    token: tokenIn,
    estimate,
    pool,
    outputToken: tokenOut.id,
    inputToken: tokenIn.id,
  };
};

export const getPoolEstimate = async ({
  tokenIn,
  tokenOut,
  amountIn,
  Pool,
}: {
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amountIn: string;
  Pool: Pool;
}) => {
  if (isStablePool(Pool.id)) {
    const stablePoolInfo = (
      await getStablePoolFromCache(Pool.id.toString())
    )[1];

    return getStablePoolEstimate({
      tokenIn,
      tokenOut,
      amountIn: toReadableNumber(tokenIn.decimals, amountIn),
      stablePoolInfo,
      stablePool: Pool,
    });
  } else {
    return getSinglePoolEstimate(tokenIn, tokenOut, Pool, amountIn);
  }
};

export function getAuroraConfig(env: string = process.env.NEAR_ENV) {
  switch (env) {
    case "production":
    case "pub-testnet":
      return {
        trisolarisAddress: "0x26ec2aFBDFdFB972F106100A3deaE5887353d9B9",
        ethBridgeAddress: "0xe9217bc70b7ed1f598ddd3199e80b093fa71124f",
        factoryAddress: "0x60913758635b54e6C9685f92201A5704eEe74748",
        WETH: "0x1b6A3d5B5DCdF7a37CFE35CeBC0C4bD28eA7e946",
        Pairs: {
          "wNEAR-USDC": "0x37401f53be96E28996d18A1964F47dF9e23b15D2",
          "ETH-USDC": "0x0084B7b4C64eDaaB4d7783e5Fe27f796C4783d44",
          "wNEAR-LINEAR": "0x75164fb3589c568Ce422Ca99aF9d23dCA410541a",
          "ETH-LINEAR": "0xF6E611DE9584A95Df64e587E0C67de94f299C717",
        },
        networkId: "testnet",
      };
    case "testnet":
      return {
        trisolarisAddress: "0x26ec2aFBDFdFB972F106100A3deaE5887353d9B9",
        ethBridgeAddress: "0xe9217bc70b7ed1f598ddd3199e80b093fa71124f",
        factoryAddress: "0x60913758635b54e6C9685f92201A5704eEe74748",
        WETH: "0x1b6A3d5B5DCdF7a37CFE35CeBC0C4bD28eA7e946",
        Pairs: {
          "wNEAR-USDC": "0x37401f53be96E28996d18A1964F47dF9e23b15D2",
          "ETH-USDC": "0x0084B7b4C64eDaaB4d7783e5Fe27f796C4783d44",
          "wNEAR-LINEAR": "0x75164fb3589c568Ce422Ca99aF9d23dCA410541a",
          "ETH-LINEAR": "0xF6E611DE9584A95Df64e587E0C67de94f299C717",
        },
        networkId: "testnet",
      };
    case "development":
    case "mainnet":
      return {
        trisolarisAddress: "0x2cb45edb4517d5947afde3beabf95a582506858b",
        ethBridgeAddress: "0xe9217bc70b7ed1f598ddd3199e80b093fa71124f",
        factoryAddress: "0xc66F594268041dB60507F00703b152492fb176E7",
        WETH: "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB",
        Pairs: {
          "wNEAR-TRI": "0x84b123875F0F36B966d0B6Ca14b31121bd9676AD",
          "AURORA-ETH": "0x5eeC60F348cB1D661E4A5122CF4638c7DB7A886e",
          "wNEAR-ETH": "0x63da4DB6Ef4e7C62168aB03982399F9588fCd198",
          "wNEAR-USDC": "0x20F8AeFB5697B77E0BB835A8518BE70775cdA1b0",
          "wNEAR-USDT": "0x03B666f3488a7992b2385B12dF7f35156d7b29cD",
          "USDC-USDT": "0x2fe064B6c7D274082aa5d2624709bC9AE7D16C77",
          "wNEAR-WBTC": "0xbc8A244e8fb683ec1Fd6f88F3cc6E565082174Eb",
          "TRI-AURORA": "0xd1654a7713617d41A8C9530Fb9B948d00e162194",
          "wNEAR-atLUNA": "0xdF8CbF89ad9b7dAFdd3e37acEc539eEcC8c47914",
          "wNEAR-atUST": "0xa9eded3E339b9cd92bB6DEF5c5379d678131fF90",
          "TRI-USDT": "0x61C9E05d1Cdb1b70856c7a2c53fA9c220830633c",
          "wNEAR-AVAX": "0x6443532841a5279cb04420E61Cf855cBEb70dc8C",
          "wNEAR-BNB": "0x7be4a49AA41B34db70e539d4Ae43c7fBDf839DfA",
          "wNEAR-MATIC": "0x3dC236Ea01459F57EFc737A12BA3Bb5F3BFfD071",
          "wNEAR-FLX": "0x48887cEEA1b8AD328d5254BeF774Be91B90FaA09",
          "wNEAR-MECHA": "0xd62f9ec4C4d323A0C111d5e78b77eA33A2AA862f",
          // 'wNEAR-SOLACE': '0xdDAdf88b007B95fEb42DDbd110034C9a8e9746F2',
          "XTRI-STNEAR": "0x5913f644A10d98c79F2e0b609988640187256373",
          "wNEAR-STNEAR": "0x47924Ae4968832984F4091EEC537dfF5c38948a4",
          "AURORA-XNL": "0xb419ff9221039Bdca7bb92A131DD9CF7DEb9b8e5",
          "wNEAR-XNL": "0xFBc4C42159A5575a772BebA7E3BF91DB508E127a",
          "GBA-USDT": "0x7B273238C6DD0453C160f305df35c350a123E505",
          "aUSDO-USDT": "0x6277f94a69Df5df0Bc58b25917B9ECEFBf1b846A",
          "BBT-wNEAR": "0xadaba7e2bf88bd10acb782302a568294566236dc",
          "SHITZU-USDC": "0x5E74D85311fe2409c341Ce49Ce432BB950D221DE",
          "ROSE-wNEAR": "0xbe753E99D0dBd12FB39edF9b884eBF3B1B09f26C",
          "rUSD-wNEAR": "0xbC0e71aE3Ef51ae62103E003A9Be2ffDe8421700",
          "LINEAR-wNEAR": "0xbceA13f9125b0E3B66e979FedBCbf7A4AfBa6fd1",
          "KSW-wNEAR": "0x29C160d2EF4790F9A23B813e7544D99E539c28Ba",
          "AURORA-wNEAR": "0x1e0e812FBcd3EB75D8562AD6F310Ed94D258D008",
          "BRRR-wNEAR": "0x71dBEB011EAC90C51b42854A77C45C1E53242698",
          "PAD-wNEAR": "0x6a29e635BCaB8aBeE1491059728e3D6D11d6A114",
          "BSTN-wNEAR": "0xBBf3D4281F10E537d5b13CA80bE22362310b2bf9",
          "STNEAR-TRI": "0x120e713AD36eCBff171FC8B7cf19FA8B6f6Ba50C",
          "USN-wNEAR": "0xa36df7c571beba7b3fb89f25dfc990eac75f525a",
        },
        networkId: "mainnet",
      };
    default:
      return {
        trisolarisAddress: "0x2cb45edb4517d5947afde3beabf95a582506858b",
        ethBridgeAddress: "0xe9217bc70b7ed1f598ddd3199e80b093fa71124f",
        factoryAddress: "0xc66F594268041dB60507F00703b152492fb176E7",
        WETH: "0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB",
        Pairs: {
          "wNEAR-TRI": "0x84b123875F0F36B966d0B6Ca14b31121bd9676AD",
          "AURORA-ETH": "0x5eeC60F348cB1D661E4A5122CF4638c7DB7A886e",
          "wNEAR-ETH": "0x63da4DB6Ef4e7C62168aB03982399F9588fCd198",
          "wNEAR-USDC": "0x20F8AeFB5697B77E0BB835A8518BE70775cdA1b0",
          "wNEAR-USDT": "0x03B666f3488a7992b2385B12dF7f35156d7b29cD",
          "USDC-USDT": "0x2fe064B6c7D274082aa5d2624709bC9AE7D16C77",
          "wNEAR-WBTC": "0xbc8A244e8fb683ec1Fd6f88F3cc6E565082174Eb",
          "TRI-AURORA": "0xd1654a7713617d41A8C9530Fb9B948d00e162194",
          "wNEAR-atLUNA": "0xdF8CbF89ad9b7dAFdd3e37acEc539eEcC8c47914",
          "wNEAR-atUST": "0xa9eded3E339b9cd92bB6DEF5c5379d678131fF90",
          "TRI-USDT": "0x61C9E05d1Cdb1b70856c7a2c53fA9c220830633c",
          "wNEAR-AVAX": "0x6443532841a5279cb04420E61Cf855cBEb70dc8C",
          "wNEAR-BNB": "0x7be4a49AA41B34db70e539d4Ae43c7fBDf839DfA",
          "wNEAR-MATIC": "0x3dC236Ea01459F57EFc737A12BA3Bb5F3BFfD071",
          "wNEAR-FLX": "0x48887cEEA1b8AD328d5254BeF774Be91B90FaA09",
          "wNEAR-MECHA": "0xd62f9ec4C4d323A0C111d5e78b77eA33A2AA862f",
          // 'wNEAR-SOLACE': '0xdDAdf88b007B95fEb42DDbd110034C9a8e9746F2',
          "XTRI-STNEAR": "0x5913f644A10d98c79F2e0b609988640187256373",
          "wNEAR-STNEAR": "0x47924Ae4968832984F4091EEC537dfF5c38948a4",
          "AURORA-XNL": "0xb419ff9221039Bdca7bb92A131DD9CF7DEb9b8e5",
          "wNEAR-XNL": "0xFBc4C42159A5575a772BebA7E3BF91DB508E127a",
          "GBA-USDT": "0x7B273238C6DD0453C160f305df35c350a123E505",
          "aUSDO-USDT": "0x6277f94a69Df5df0Bc58b25917B9ECEFBf1b846A",
          "BBT-wNEAR": "0xadaba7e2bf88bd10acb782302a568294566236dc",
          "SHITZU-USDC": "0x5E74D85311fe2409c341Ce49Ce432BB950D221DE",
          "ROSE-wNEAR": "0xbe753E99D0dBd12FB39edF9b884eBF3B1B09f26C",
          "rUSD-wNEAR": "0xbC0e71aE3Ef51ae62103E003A9Be2ffDe8421700",
          "LINEAR-wNEAR": "0xbceA13f9125b0E3B66e979FedBCbf7A4AfBa6fd1",
          "KSW-wNEAR": "0x29C160d2EF4790F9A23B813e7544D99E539c28Ba",
          "AURORA-wNEAR": "0x1e0e812FBcd3EB75D8562AD6F310Ed94D258D008",
          "BRRR-wNEAR": "0x71dBEB011EAC90C51b42854A77C45C1E53242698",
          "PAD-wNEAR": "0x6a29e635BCaB8aBeE1491059728e3D6D11d6A114",
          "BSTN-wNEAR": "0xBBf3D4281F10E537d5b13CA80bE22362310b2bf9",
          "STNEAR-TRI": "0x120e713AD36eCBff171FC8B7cf19FA8B6f6Ba50C",
          "USN-wNEAR": "0xa36df7c571beba7b3fb89f25dfc990eac75f525a",
        },
        networkId: "mainnet",
      };
  }
}

export const tokenListTestnet = {
  name: "Aurora",
  logoURI:
    "https://raw.githubusercontent.com/aurora-is-near/aurora-press-kit/master/Logos/SVG/aurora-stack.svg",
  keywords: ["aurora", "near", "rainbow", "bridge", "audited", "verified"],
  tags: {
    aurora: {
      name: "Native Aurora",
      description: "Tokens that were deployed initially on Aurora.",
    },
    near: {
      name: "Native NEAR",
      description:
        "Tokens that were deployed initially on NEAR. They have an equivalent token in Aurora.",
    },
    ethereum: {
      name: "Native Ethereum",
      description:
        "Tokens that were deployed initially on Ethereum. They have an equivalent token in NEAR and Aurora.",
    },
    bsc: {
      name: "Native BSC",
      description:
        "Tokens that were deployed initially on BSC. They have an equivalent token in NEAR and Aurora.",
    },
    terra: {
      name: "Native Terra",
      description:
        "Tokens that were deployed initially on Terra. They have an equivalent token in Aurora.",
    },
  },
  timestamp: "2022-01-19T16:04:39+00:00",
  tokens: [
    {
      chainId: 1313161555,
      address: "0x4861825E75ab14553E5aF711EbbE6873d369d146",
      symbol: "wNEAR",
      name: "Wrapped NEAR fungible token",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/near.svg",
      tags: [],
    },
    {
      chainId: 1313161555,
      address: "0xfbe05B1d7bE9A5510C8363e5B9dc1F6AcB03F209",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/usdc.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161555,
      address: "0xE4979CaC5D70F01697f795f0ad56BbcA05912c44",
      symbol: "LINEAR",
      name: "LiNEAR",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/linear.svg",
      tags: [],
    },
  ],
  version: {
    major: 1,
    minor: 0,
    patch: 0,
  },
};

export const tokenListMainnet = {
  name: "Aurora",
  logoURI:
    "https://raw.githubusercontent.com/aurora-is-near/aurora-press-kit/master/Logos/SVG/aurora-stack.svg",
  keywords: ["aurora", "near", "rainbow", "bridge", "audited", "verified"],
  tags: {
    aurora: {
      name: "Native Aurora",
      description: "Tokens that were deployed initially on Aurora.",
    },
    near: {
      name: "Native NEAR",
      description:
        "Tokens that were deployed initially on NEAR. They have an equivalent token in Aurora.",
    },
    ethereum: {
      name: "Native Ethereum",
      description:
        "Tokens that were deployed initially on Ethereum. They have an equivalent token in NEAR and Aurora.",
    },
    bsc: {
      name: "Native BSC",
      description:
        "Tokens that were deployed initially on BSC. They have an equivalent token in NEAR and Aurora.",
    },
    terra: {
      name: "Native Terra",
      description:
        "Tokens that were deployed initially on Terra. They have an equivalent token in Aurora.",
    },
    allbridge: {
      name: "Bridge Allbridge",
      description: "Tokens that were bridged using Allbridge",
    },
  },
  timestamp: "2022-04-05T19:17:24+00:00",
  tokens: [
    {
      chainId: 1313161554,
      address: "0xc21ff01229e982d7c8b8691163b0a3cb8f357453",
      symbol: "$META",
      name: "Meta Token",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/$meta.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x293074789b247cab05357b08052468B5d7A23c5a",
      symbol: "aUSDO",
      name: "aUSDO",
      decimals: 8,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/aUSDO.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x4e834cdcc911605227eedddb89fad336ab9dc00a",
      symbol: "AAVE",
      name: "Aave Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/aave.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x2BAe00C8BC1868a5F7a216E881Bae9e662630111",
      symbol: "ABR",
      name: "Allbridge - Allbridge",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/abr_abr.svg",
      tags: ["ethereum", "allbridge"],
    },
    {
      chainId: 1313161554,
      address: "0x6961775A3Cafa23fcd24Df8F9b72fc98692B9288",
      symbol: "GATA",
      name: "Gata Protocol Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/gata.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x95f09a800e80a17eac1ba746489c48a1e012d855",
      symbol: "HBTC",
      name: "Huobi BTC",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/hbtc.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x5183e1b1091804bc2602586919e6880ac1cf2896",
      symbol: "USN",
      name: "USN",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/usn.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x0240ae04c9f47b91cf47ca2e7ef44c9de0d385ac",
      symbol: "BRRR",
      name: "Burrow Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/brrr.svg",
      tags: [],
    },

    {
      chainId: 1313161554,
      address: "0xC4bdd27c33ec7daa6fcfd8532ddB524Bf4038096",
      symbol: "atLUNA",
      name: "Luna Terra - Allbridge",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/abr_atluna.svg",
      tags: ["terra", "allbridge"],
    },
    {
      chainId: 1313161554,
      address: "0x5ce9F0B6AFb36135b5ddBF11705cEB65E634A9dC",
      symbol: "atUST",
      name: "UST Terra - Allbridge",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/abr_atust.svg",
      tags: ["terra", "allbridge"],
    },
    {
      chainId: 1313161554,
      address: "0x5C92A4A7f59A9484AFD79DbE251AD2380E589783",
      symbol: "abBUSD",
      name: "BUSD BSC - Allbridge",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/abr_busd.svg",
      tags: ["allbridge"],
    },

    {
      chainId: 1313161554,
      address: "0x0f00576d07B594Bdc1caf44b6014A6A02E5AFd48",
      symbol: "SOL",
      name: "SOL - Allbridge",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/abr_sol.svg",
      tags: ["allbridge"],
    },
    {
      chainId: 1313161554,
      address: "0xdc7acde9ff18b4d189010a21a44ce51ec874ea7c",
      symbol: "agEUR",
      name: "agEUR",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ageur.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xb7e3617adb58dc34068522bd20cfe1660780b750",
      symbol: "ANGLE",
      name: "ANGLE",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/angle.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x8bec47865ade3b172a928df8f990bc7f2a3b9f79",
      symbol: "AURORA",
      name: "Aurora",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/aurora.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xb4530aa877d25e51c18677753acd80ffa54009b2",
      symbol: "AVRIT",
      name: "Avrit Learning",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/avrit.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x8973c9ec7b79fe880697cdbca744892682764c37",
      symbol: "BAKED",
      name: "BakedToken",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/baked.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xb59d0fdaf498182ff19c4e80c00ecfc4470926e2",
      symbol: "BAL",
      name: "Balancer",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bal.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x2b9025aecc5ce7a8e6880d3e9c6e458927ecba04",
      symbol: "BAT",
      name: "Basic Attention Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bat.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x4148d2Ce7816F0AE378d98b40eB3A7211E1fcF0D",
      symbol: "BBT",
      name: "BlueBit Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bbt.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0xe4baf0af161bf03434d1c5a53957981493c12c99",
      symbol: "bHOME",
      name: "bHome",
      decimals: 6,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bhome.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x130e6203f05805cd8c44093a53c7b50775eb4ca3",
      symbol: "BIVE",
      name: "Bizverse",
      decimals: 4,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bive.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x9f1f933c660a1dc856f0e0fe058435879c5ccef0",
      symbol: "BSTN",
      name: "Bastion",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/bstn.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xdeacf0faa2b80af41470003b5f6cd113d47b4dcd",
      symbol: "COMP",
      name: "Compound",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/comp.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xabe9818c5fb5e751c4310be6f0f18c8d85f9bd7f",
      symbol: "CREAM",
      name: "Cream Finance",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/cream.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x026dda7f0f0a2e42163c9c80d2a5b6958e35fc49",
      symbol: "CRF",
      name: "Crafting Finance",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/crf.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xe3520349f477a5f6eb06107066048508498a291b",
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/dai.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xfbd1d8dce2f97bc14239fd507183b98ff1354b39",
      symbol: "DLTA",
      name: "delta.theta",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/dlta.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xe301ed8c7630c9678c39e4e45193d1e7dfb914f7",
      symbol: "DODO",
      name: "DODO bird",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/dodo.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xd5c997724e4b5756d08e6464c01afbc5f6397236",
      symbol: "FAME",
      name: "FAME",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/fame.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xea62791aa682d455614eaa2a12ba3d9a2fd197af",
      symbol: "FLX",
      name: "Flux Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/flx.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xda2585430fef327ad8ee44af8f1f989a2a91a3d2",
      symbol: "FRAX",
      name: "Frax",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/frax.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xc8fdd32e0bf33f0396a18209188bb8c6fb8747d2",
      symbol: "FXS",
      name: "Frax Share",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/fxs.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x5ac53f985ea80c6af769b9272f35f122201d0f56",
      symbol: "HAK",
      name: "Hakuna Matata",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/hak.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x943f4bf75d5854e92140403255a471950ab8a26f",
      symbol: "HAPI",
      name: "HAPI",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/hapi.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x6454e4a4891c6b78a5a85304d34558dda5f3d6d8",
      symbol: "JUMBO",
      name: "Jumbo Exchange",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/jumbo.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0xE4eB03598f4DCAB740331fa432f4b85FF58AA97E",
      symbol: "KSW",
      name: "KillSwitchToken",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ksw.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x918dbe087040a41b786f0da83190c293dae24749",
      symbol: "LINEAR",
      name: "LiNEAR",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/linear.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x94190d8ef039c670c6d6b9990142e0ce2a1e3178",
      symbol: "LINK",
      name: "ChainLink Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/link.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xfca152a9916895bf564e3f26a611f9e1e6aa6e73",
      symbol: "LUNA",
      name: "Wrapped LUNA Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/luna.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x25e801Eb75859Ba4052C4ac4233ceC0264eaDF8c",
      symbol: "LUNAR",
      name: "LUNAR",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/lunar.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0xa33C3B53694419824722C10D99ad7cB16Ea62754",
      symbol: "MECHA",
      name: "Mecha",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/mecha.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x1d1f82d8b8fc72f29a8c268285347563cb6cd8b3",
      symbol: "MKR",
      name: "Maker",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/mkr.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xd126b48c072f4668e944a8895bc74044d5f2e85b",
      symbol: "MNFT",
      name: "MANUFACTORY",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/mnft.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x74974575d2f1668c63036d51ff48dbaa68e52408",
      symbol: "MODA",
      name: "moda",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/moda.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xC86Ca2BB9C9c9c9F140d832dE00BfA9e153FA1e3",
      symbol: "NDOL",
      name: "Necc Dollars",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ndol.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x6EBA841F1201fFDDe7DDC2ba995D3308f6C4aEa0",
      symbol: "NECC",
      name: "Necc",
      decimals: 9,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/necc.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x90eb16621274fb47a071001fbbf7550948874cb5",
      symbol: "NFD",
      name: "Feisty Doge NFT",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/nfd.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x449f661c53aE0611a24c2883a910A563A7e42489",
      symbol: "nNECC",
      name: "Wrapped Staked Necc",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/nnecc.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x951cfdc9544b726872a8faf56792ef6704731aae",
      symbol: "OCT",
      name: "Octopus Network Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/oct.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x07b2055fbd17b601c780aeb3abf4c2b3a30c7aae",
      symbol: "OIN",
      name: "oinfinance",
      decimals: 8,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/oin.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xc2aa4b56e325266e32582f5f5cece7e88f0c11d2",
      symbol: "PACHA",
      name: "PachaVerse DAO",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/pacha.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x34F291934b88c7870B7A17835B926B264fc13a81",
      symbol: "PAD",
      name: "SmartPad token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/smartpad.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x291c8fceaca3342b29cc36171deb98106f712c66",
      symbol: "PICKLE",
      name: "PickleToken",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/pickle.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x09c9d464b58d96837f8d8b6f4d9fe4ad408d3a4f",
      symbol: "PLY",
      name: "Aurigami Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ply.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xf0f3b9Eee32b1F490A4b8720cf6F005d4aE9eA86",
      symbol: "POLAR",
      name: "POLAR",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/polar.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x8828a5047d093f6354e3fe29ffcb2761300dc994",
      symbol: "PULSE",
      name: "Pulse",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/pulse.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x221292443758f63563a1ed04b547278b05845fcb",
      symbol: "REF",
      name: "Ref Finance Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ref.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x18921f1e257038e538ba24d49fa6495c8b1617bc",
      symbol: "REN",
      name: "Republic",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ren.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xd9a4c034e69e5162ac02bec627475470a53c9a14",
      symbol: "rMC",
      name: "rMutantCoin",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/rmc.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xdc9be1ff012d3c6da818d136a3b2e5fdd4442f74",
      symbol: "SNX",
      name: "Synthetix Network Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/snx.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x1BDA7007C9e3Bc33267E883864137aF8eb53CC2D",
      symbol: "SOLACE",
      name: "solace",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/solace.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x9D6fc90b25976E40adaD5A3EdD08af9ed7a21729",
      symbol: "SPOLAR",
      name: "SPOLAR",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/spolar.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x07f9f7f963c5cd2bbffd30ccfb964be114332e30",
      symbol: "STNEAR",
      name: "Staked NEAR",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/stnear.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x7821c773a12485b12a2b5b7bc451c3eb200986b1",
      symbol: "SUSHI",
      name: "SushiToken",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/sushi.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xFa94348467f64D5A457F75F8bc40495D33c65aBB",
      symbol: "TRI",
      name: "Trisolaris",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/tri.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x5454ba0a9e3552f7828616d80a9d2d869726e6f5",
      symbol: "TUSD",
      name: "TrueUSD",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/tusd.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x984c2505a14da732d7271416356f535953610340",
      symbol: "UMINT",
      name: "YouMinter",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/umint.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x1bc741235ec0ee86ad488fa49b69bb6c823ee7b7",
      symbol: "UNI",
      name: "Uniswap",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/uni.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xb12bfca5a55806aaf64e99521918a4bf0fc40802",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/usdc.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x4988a896b1227218e4a686fde5eabdcabd91571f",
      symbol: "USDT",
      name: "TetherUS",
      decimals: 6,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/usdt.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x098d5b6a26bca1d71f2335805d71b244f94e8a5f",
      symbol: "UST",
      name: "Wrapped UST Token",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/ust.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x17bC24b9bDD8A3E7486E3C3458a5954412F2ff60",
      symbol: "VRA",
      name: "Virtual Reality Asset",
      decimals: 4,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/vra.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x7faA64Faf54750a2E3eE621166635fEAF406Ab22",
      symbol: "WANNA",
      name: "WannaSwap",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/wanna.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0xf4eb217ba2454613b15dbdea6e5f22276410e89e",
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/wbtc.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xC42C30aC6Cc15faC9bD938618BcaA1a1FaE8501d",
      symbol: "wNEAR",
      name: "Wrapped NEAR fungible token",
      decimals: 24,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/wnear.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0x99ec8f13b2afef5ec49073b9d20df109d25f78c0",
      symbol: "WOO",
      name: "Wootrade Network",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/woo.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0xf34d508bac379825255cc80f66cbc89dfeff92e4",
      symbol: "WSTR",
      name: "WrappedStar",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/wstr.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x7ca1c28663b76cfde424a9494555b94846205585",
      symbol: "XNL",
      name: "Chronicle",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/xnl.svg",
      tags: ["ethereum"],
    },
    {
      chainId: 1313161554,
      address: "0x802119e4e253D5C19aA06A5d567C5a41596D6803",
      symbol: "xTRI",
      name: "TriBar",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/xtri.svg",
      tags: [],
    },
    {
      chainId: 1313161554,
      address: "0xa64514a8af3ff7366ad3d5daa5a548eefcef85e0",
      symbol: "YFI",
      name: "yearn.finance",
      decimals: 18,
      logoURI:
        "https://raw.githubusercontent.com/aurora-is-near/bridge-assets/master/tokens/yfi.svg",
      tags: ["ethereum"],
    },
  ],
  version: {
    major: 1,
    minor: 10,
    patch: 0,
  },
};

export const isNotStablePool = (pool: Pool) => {
  return !isStablePool(pool.id);
};

export const filterBlackListPools = (pool: any & { id: any }) =>
  !BLACKLIST_POOL_IDS.includes(pool.id.toString());

export async function getExpectedOutputFromActions(
  actions: any,
  outputToken: any,
  slippageTolerance: any
) {
  // TODO: on cross swap case
  // console.log('INSIDE EXPECTED OUTPUT FUNC');
  // console.log(outputToken);
  // console.log(actions);

  let expectedOutput = new Big(0);

  if (!actions || actions.length === 0) return expectedOutput;

  const routes = separateRoutes(actions, outputToken);

  for (let i = 0; i < routes.length; i++) {
    const curRoute = routes[i];

    if (curRoute.length === 1) {
      expectedOutput = expectedOutput.plus(curRoute[0].estimate);
    } else {
      if (
        curRoute.every(r => r.pool.Dex !== "tri") ||
        curRoute.every(r => r.pool.Dex === "tri")
      )
        expectedOutput = expectedOutput.plus(curRoute[1].estimate);
      else {
        const secondHopAmountIn = percentLess(
          slippageTolerance,
          curRoute[0].estimate
        );
        const secondEstimateOut = await getPoolEstimate({
          tokenIn: curRoute[1].tokens[1],
          tokenOut: curRoute[1].tokens[2],
          amountIn: toNonDivisibleNumber(
            curRoute[1].tokens[1].decimals,
            secondHopAmountIn
          ),
          Pool: curRoute[1].pool,
        });

        expectedOutput = expectedOutput.plus(secondEstimateOut.estimate);
      }
    }
  }

  return expectedOutput;
}

export const wrapNear = async (amount: string) => {
  const transactions: Transaction[] = [];
  const neededStorage = await checkTokenNeedsStorageDeposit();
  if (neededStorage) {
    transactions.push({
      receiverId: REF_FI_CONTRACT_ID,
      functionCalls: [
        {
          methodName: "storage_deposit",
          args: {
            account_id: ACCOUNT_ID,
            registration_only: false,
          },
          gas: "30000000000000",
          amount: neededStorage,
        },
      ],
    });
  }

  const actions: RefFiFunctionCallOptions[] = [];
  const balance = await ftGetStorageBalance(WRAP_NEAR_CONTRACT_ID);

  if (!balance || balance.total === "0") {
    actions.push({
      methodName: "storage_deposit",
      args: {},
      gas: "30000000000000",
      amount: NEW_ACCOUNT_STORAGE_COST,
    });
  }

  actions.push({
    methodName: "near_deposit",
    args: {},
    gas: "50000000000000",
    amount: toReadableNumber(24, toNonDivisibleNumber(24, amount)),
  });

  actions.push({
    methodName: "ft_transfer_call",
    args: {
      receiver_id: REF_FI_CONTRACT_ID,
      // amount:utils.format.formatNearAmount(amount)
      amount: toNonDivisibleNumber(24, amount),
      msg: "",
    },
    gas: "50000000000000",
    amount: ONE_YOCTO_NEAR,
  });

  transactions.push({
    receiverId: WRAP_NEAR_CONTRACT_ID,
    functionCalls: actions,
  });

  return executeMultipleTransactions(transactions);
};

export const checkTokenNeedsStorageDeposit = async () => {
  let storageNeeded: math.MathType = 0;

  const needDeposit = await needDepositStorage();
  if (needDeposit) {
    storageNeeded = Number(ONE_MORE_DEPOSIT_AMOUNT);
  } else {
    const balance = await Promise.resolve(currentStorageBalance(ACCOUNT_ID));

    if (!balance) {
      storageNeeded = math.add(
        storageNeeded,
        Number(ACCOUNT_MIN_STORAGE_AMOUNT)
      );
    }

    if (new BN(balance?.available || "0").lt(MIN_DEPOSIT_PER_TOKEN)) {
      storageNeeded = math.add(storageNeeded, Number(STORAGE_PER_TOKEN));
    }
  }

  return storageNeeded ? storageNeeded.toString() : "";
};

export const needDepositStorage = async (accountId = ACCOUNT_ID) => {
  const storage = await refFiViewFunction({
    methodName: "get_user_storage_state",
    args: { account_id: accountId },
  });

  return new BN(storage?.deposit).lte(new BN(storage?.usage));
};

export const currentStorageBalance = (
  accountId: string
): Promise<AccountStorageView> => {
  return refFiViewFunction({
    methodName: "storage_balance_of",
    args: { account_id: accountId },
  });
};

export const ftGetBalance = async (tokenId: string, account_id?: string) => {
  return ftViewFunction(tokenId, {
    methodName: "ft_balance_of",
    args: {
      account_id,
    },
  }).catch(() => "0");
};

export const getAccountNearBalance = async (accountId: string) => {
  const provider = new providers.JsonRpcProvider({
    url: getConfig().nodeUrl,
  });

  return provider
    .query<AccountView>({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    })
    .then(data => ({ available: data.amount }));
};
