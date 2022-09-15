import { useState, useEffect } from "react";
import { ACCOUNT_ID } from "./config";
import { ftGetBalance, getAccountNearBalance, toReadableNumber } from "./utils";

export const useDepositableBalance = (
  tokenId: string,
  decimals?: number,
  dependabale?: boolean
) => {
  const [depositable, setDepositable] = useState<string>("");
  const [max, setMax] = useState<string>("");

  useEffect(() => {
    if (tokenId === "NEAR") {
      getAccountNearBalance(ACCOUNT_ID).then(({ available }: any) =>
        setDepositable(available)
      );
    } else if (tokenId) {
      ftGetBalance(tokenId).then(setDepositable);
    }
  }, [tokenId]);

  useEffect(() => {
    const max = toReadableNumber(decimals, depositable) || "0";
    setMax(max);
  }, [depositable]);

  return max;
};
