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
  StorageDepositActionOptions,
  STORAGE_PER_TOKEN,
  SwapOptions,
  SwapOptions1,
  SWAP_MODE,
  TokenMetadata,
  Transaction,
  WithdrawActionOptions,
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
    onRef: true,
    onTri: true,
  };
  if (mode === "user_holdings") {
    if (token === WRAP_NEAR_CONTRACT_ID) {
      getAccountNearBalance(ACCOUNT_ID).then(
        ({ available }: any) =>
          (obj.balance = Number(available) / 10 ** tokenInfo.decimals)
      );
    } else {
      let balance = await account.viewFunction(token, "ft_balance_of", {
        account_id: ACCOUNT_ID,
      });
      obj.balance = balance / 10 ** tokenInfo.decimals;
    }
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

    // transactions.push(nearWithdrawTransaction(minAmountOut));
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
        try {
          await account.functionCall({
            contractId: transaction.receiverId,
            methodName: fc.methodName,
            args: fc.args,
            attachedDeposit: new BN(
              utils.format.parseNearAmount(fc.amount || "0")
            ),
            gas: new BN(getGas(fc.gas).toNumber().toFixed()),
          });
        } catch (error) {
          console.log("err========", error.message);
        }
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
  const { allStablePoolsById, allStablePools } =
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

export const unwrapNear = async (amount: string) => {
  const transactions: Transaction[] = [];

  const balance = await ftGetStorageBalance(WRAP_NEAR_CONTRACT_ID);

  if (!balance || balance.total === "0") {
    transactions.push({
      receiverId: WRAP_NEAR_CONTRACT_ID,
      functionCalls: [
        {
          methodName: "storage_deposit",
          args: {},
          gas: "30000000000000",
          amount: NEW_ACCOUNT_STORAGE_COST,
        },
      ],
    });
  }

  transactions.push({
    receiverId: REF_FI_CONTRACT_ID,
    functionCalls: [
      withdrawAction({
        tokenId: WRAP_NEAR_CONTRACT_ID,
        // amount: utils.format.parseNearAmount(amount),
        amount: toNonDivisibleNumber(24, amount),
      }),
    ],
  });

  transactions.push({
    receiverId: WRAP_NEAR_CONTRACT_ID,
    functionCalls: [
      {
        methodName: "near_withdraw",
        args: {
          // amount: utils.format.parseNearAmount(amount),
          amount: toNonDivisibleNumber(24, amount),
        },
        amount: ONE_YOCTO_NEAR,
      },
    ],
  });

  const needDeposit = await checkTokenNeedsStorageDeposit();
  if (needDeposit) {
    transactions.unshift({
      receiverId: REF_FI_CONTRACT_ID,
      functionCalls: [storageDepositAction({ amount: needDeposit })],
    });
  }

  return executeMultipleTransactions(transactions);
};

export const withdrawAction = ({
  tokenId,
  amount,
  unregister = false,
  singleTx,
}: WithdrawActionOptions) => ({
  methodName: "withdraw",
  args: { token_id: tokenId, amount, unregister },
  gas: singleTx ? "60000000000000" : "55000000000000",
  amount: ONE_YOCTO_NEAR,
});

export const storageDepositAction = ({
  accountId = ACCOUNT_ID,
  registrationOnly = false,
  amount,
}: StorageDepositActionOptions): RefFiFunctionCallOptions => ({
  methodName: "storage_deposit",
  args: {
    account_id: accountId,
    registration_only: registrationOnly,
  },
  amount,
});
