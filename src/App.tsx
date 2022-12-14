import React, { useEffect, useState } from "react";

import {
  ftGetBalance,
  getGlobalTokens,
  getUserTokens,
  toReadableNumber,
  WRAP_NEAR_CONTRACT_ID,
} from "./utils";
import "./App.css";
import { SWAP_MODE, TokenMetadata } from "./near";
import { useSwap } from "./swap";
import { useDepositableBalance } from "./hooks";

const App = () => {
  const [tokenIn, setTokenIn] = useState<TokenMetadata>();
  const [tokenOut, setTokenOut] = useState<TokenMetadata>();
  const [useNearBalance, setUseNearBalance] = useState<boolean>(true);
  const [tokenInBalanceFromNear, setTokenInBalanceFromNear] =
    useState<string>();
  const [tokenOutBalanceFromNear, setTokenOutBalanceFromNear] =
    useState<string>();

  const [reEstimateTrigger, setReEstimateTrigger] = useState(false);
  const [slippageToleranceNormal, setSlippageToleranceNormal] =
    useState<number>(0.5);

  const [tokenInAmount, setTokenInAmount] = useState<string>("1");
  const [toTokens, setToTokens] = useState([]);
  const [fromTokens, setFromTokens] = useState([]);
  const [supportLedger, setSupportLedger] = useState(true);
  const slippageTolerance = slippageToleranceNormal;

  const nearBalance = useDepositableBalance("NEAR");

  console.log("nearBalance", nearBalance);

  useEffect(() => {
    (async () => {
      const globalWhitelist = await getGlobalTokens();
      const userTokens = await getUserTokens();
      console.log("userTokens", userTokens);
      if (!userTokens.length) {
        setFromTokens([
          {
            id: "wrap.near",
            name: "Near",
            symbol: "NEAR",

            contractName: "wrap.near",
            decimals: 24,
            onRef: true,
            onTri: true,
            balance: Number(nearBalance) / 10 ** 24,
          },
        ]);
      } else {
        setFromTokens([...fromTokens, ...userTokens]);
      }
      setToTokens(globalWhitelist);
    })();
  }, []);

  useEffect(() => {
    if (useNearBalance) {
      if (tokenIn) {
        const tokenInId = tokenIn.id;
        if (tokenInId) {
          ftGetBalance(tokenInId).then((available: string) =>
            setTokenInBalanceFromNear(
              toReadableNumber(
                tokenIn?.decimals,
                tokenIn.id === WRAP_NEAR_CONTRACT_ID ? nearBalance : available
              )
            )
          );
        }
      }
      if (tokenOut) {
        const tokenOutId = tokenOut.id;
        if (tokenOutId) {
          ftGetBalance(tokenOutId).then((available: string) =>
            setTokenOutBalanceFromNear(
              toReadableNumber(
                tokenOut?.decimals,
                tokenOut.id === WRAP_NEAR_CONTRACT_ID ? nearBalance : available
              )
            )
          );
        }
      }
    }
  }, [tokenIn, tokenOut, useNearBalance, nearBalance]);

  const {
    canSwap,
    tokenOutAmount,
    minAmountOut,
    pools,
    swapError,
    makeSwap,
    avgFee,
    isParallelSwap,
    swapsToDo,
    setCanSwap,
  } = useSwap({
    tokenIn,
    tokenInAmount,
    tokenOut,
    slippageTolerance,
    swapMode: SWAP_MODE.NORMAL,
    reEstimateTrigger,
    supportLedger,
  });

  const handleSwap = async () => {
    console.log("handleSwap");
    makeSwap(useNearBalance);
  };

  const handleSelectTokenIn = (e: any) => {
    console.log(e.target.value);
    let token = toTokens.find(tk => tk.id === e.target.value);
    console.log(token);
    setTokenOut(token);
  };

  const handleSelectTokenOut = (e: any) => {
    let token = fromTokens.find(tk => tk.id === e.target.value);
    console.log(token);
    setTokenIn(token);
  };

  return (
    <div className="App">
      <h1>NEAR SWAP</h1>

      <label>From Token</label>
      <select onChange={handleSelectTokenOut}>
        <option>Select</option>
        {fromTokens.map(tk => (
          <option value={tk.contractName} key={tk.contractName}>
            {tk.name} {tk.balance}
          </option>
        ))}
      </select>
      <input
        placeholder="Enter amount"
        value={tokenInAmount}
        onChange={e => setTokenInAmount(e.target.value)}
      />

      <label>To Token</label>
      <select onChange={handleSelectTokenIn}>
        {toTokens.map(tk => (
          <option value={tk.contractName} key={tk.contractName}>
            {tk.name}
          </option>
        ))}
      </select>
      <input placeholder="Token out amount" value={tokenOutAmount} />

      <button onClick={handleSwap}>Swap</button>
    </div>
  );
};

export default App;
