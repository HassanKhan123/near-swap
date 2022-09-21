import React, { useEffect, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  EstimateSwapView,
  ONLY_ZEROS,
  Pool,
  PoolMode,
  SwapOptions,
} from "./near";
import {
  estimateSwap,
  getExpectedOutputFromActions,
  percentLess,
  POOL_TOKEN_REFRESH_INTERVAL,
  swap,
  unwrapNear,
} from "./utils";

export const useSwap = ({
  tokenIn,
  tokenInAmount,
  tokenOut,
  slippageTolerance,

  swapMode,
  reEstimateTrigger,
  supportLedger,
}: SwapOptions) => {
  console.log("TOKEN=========", tokenIn, tokenOut);
  const [pool, setPool] = useState<Pool>();
  const [canSwap, setCanSwap] = useState<boolean>();
  const [tokenOutAmount, setTokenOutAmount] = useState<string>("");
  const [swapError, setSwapError] = useState<Error>();
  const [swapsToDo, setSwapsToDo] = useState<EstimateSwapView[]>();

  const [avgFee, setAvgFee] = useState<number>(0);

  const minAmountOut = tokenOutAmount
    ? percentLess(slippageTolerance, tokenOutAmount)
    : null;

  useEffect(() => {
    getEstimate();
  }, [tokenIn, tokenOut, tokenInAmount, reEstimateTrigger, supportLedger]);

  const setAverageFee = (estimates: EstimateSwapView[]) => {
    const estimate = estimates[0];

    let avgFee: number = 0;
    if (estimates.length === 1) {
      avgFee = estimates[0].pool.fee;
    } else if (
      estimate.status === PoolMode.SMART ||
      estimate.status === PoolMode.STABLE
    ) {
      avgFee = estimates.reduce((pre, cur) => pre + cur.pool.fee, 0);
    }
    setAvgFee(avgFee);
  };

  const getEstimate = () => {
    setCanSwap(false);

    if (tokenIn && tokenOut && tokenIn.id !== tokenOut.id) {
      setSwapError(null);
      if (!tokenInAmount || ONLY_ZEROS.test(tokenInAmount)) {
        setTokenOutAmount("0");
        return;
      }

      estimateSwap({
        tokenIn,
        tokenOut,
        amountIn: tokenInAmount,
        swapMode,
        supportLedger,
      })
        .then(async estimates => {
          console.log("estimates", estimates);
          if (!estimates) throw "";
          if (tokenInAmount && !ONLY_ZEROS.test(tokenInAmount)) {
            console.log("estimates", estimates);
            setAverageFee(estimates);

            setSwapError(null);
            const expectedOut = (
              await getExpectedOutputFromActions(
                estimates,
                tokenOut.id,
                slippageTolerance
              )
            ).toString();

            setTokenOutAmount(expectedOut);
            setSwapsToDo(estimates);
            setCanSwap(true);
          }

          setPool(estimates[0].pool);
        })
        .catch(err => {
          setCanSwap(false);
          setTokenOutAmount("");
          setSwapError(err);
        });
    } else if (
      tokenIn &&
      tokenOut &&
      !tokenInAmount &&
      ONLY_ZEROS.test(tokenInAmount) &&
      tokenIn.id !== tokenOut.id
    ) {
      setTokenOutAmount("0");
    }
  };

  const makeSwap = (useNearBalance: boolean) => {
    console.log("makeSwap");
    swap({
      slippageTolerance,
      swapsToDo,
      tokenIn,
      amountIn: tokenInAmount,
      tokenOut,
      useNearBalance,
    })
      .then(() => {
        unwrapNear(tokenOutAmount);
      })
      .catch(setSwapError);
  };

  return {
    canSwap,
    tokenOutAmount,
    minAmountOut,
    pool,
    setCanSwap,
    swapError,
    makeSwap,
    avgFee,
    pools: swapsToDo?.map(estimate => estimate.pool),
    swapsToDo,
    isParallelSwap: swapsToDo?.every(e => e.status === PoolMode.PARALLEL),
    isSmartRouteV2Swap: swapsToDo?.every(e => e.status !== PoolMode.SMART),
  };
};
