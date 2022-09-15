//@ts-nocheck

import { keyStores, Near } from "near-api-js";

import getConfig from "./config";

const config = getConfig();
const { REF_TOKEN_ID, XREF_TOKEN_ID, REF_FARM_BOOST_CONTRACT_ID } = getConfig();

const MAX_PER_PAGE = 100;

const near = new Near({
  keyStore: new keyStores.InMemoryKeyStore(),
  headers: {},
  ...config,
});

const farmView = ({
  methodName,
  args = {},
}: {
  methodName: string;
  args?: object;
}) => {
  return near.connection.provider
    .query({
      request_type: "call_function",
      finality: "final",
      account_id: config.REF_FARM_CONTRACT_ID,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    })
    .then(({ result }) => JSON.parse(Buffer.from(result).toString()));
};
const getTokens = async () => {
  return await fetch(config.indexerUrl + "/list-token", {
    method: "GET",
    headers: { "Content-type": "application/json; charset=UTF-8" },
  })
    .then(res => res.json())
    .then(tokens => {
      return tokens;
    });
};

const getFarms = (page: number) => {
  const MAX_PER_PAGE = 300;
  const index = (page - 1) * MAX_PER_PAGE;

  return farmView({
    methodName: "list_farms",
    args: { from_index: index, limit: MAX_PER_PAGE },
  });
};

/***boost start***/
const contractView = ({
  methodName,
  args = {},
  contract,
}: {
  methodName: string;
  args?: object;
  contract: string;
}) => {
  return near.connection.provider
    .query({
      request_type: "call_function",
      finality: "final",
      account_id: contract,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    })
    .then(({ result }: any) => JSON.parse(Buffer.from(result).toString()));
};
const get_list_seeds_info = async () => {
  return contractView({
    methodName: "list_seeds_info",
    contract: REF_FARM_BOOST_CONTRACT_ID,
  });
};
const getPrice = async () => {
  return contractView({
    methodName: "get_virtual_price",
    contract: XREF_TOKEN_ID,
  });
};
const get_list_seed_farms = async (seed_id: string) => {
  return contractView({
    methodName: "list_seed_farms",
    args: { seed_id },
    contract: REF_FARM_BOOST_CONTRACT_ID,
  });
};

const toReadableNumber = (decimals: number, number: string = "0"): string => {
  if (!decimals) return number;

  const wholeStr = number.substring(0, number.length - decimals) || "0";
  const fractionStr = number
    .substring(number.length - decimals)
    .padStart(decimals, "0")
    .substring(0, decimals);

  return `${wholeStr}.${fractionStr}`.replace(/\.?0+$/, "");
};

run();

async function run() {
  // cachePools();
}
